/**
 * API para gestionar el Rate Limiting de colas
 * Permite monitorear y configurar los límites de concurrencia por provider
 */

const express = require('express');
const mongoose = require('mongoose');
const { globalQueueManager, DEFAULT_CONCURRENCY_LIMITS } = require('../lib/request-queue');

const router = express.Router();

// Schema para guardar configuración de rate limits en MongoDB
const rateLimitConfigSchema = new mongoose.Schema({
  providerLimits: {
    type: Map,
    of: Number,
    default: new Map()
  },
  globalEnabled: {
    type: Boolean,
    default: true
  },
  maxRetries: {
    type: Number,
    default: 3
  },
  enableFallback: {
    type: Boolean,
    default: true
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, { collection: 'rate_limit_config' });

const RateLimitConfig = mongoose.models.RateLimitConfig || mongoose.model('RateLimitConfig', rateLimitConfigSchema);

/**
 * Carga y aplica la configuración desde MongoDB
 */
async function loadAndApplyConfig() {
  try {
    const config = await RateLimitConfig.findOne().sort({ updatedAt: -1 }).lean();
    if (config && config.providerLimits) {
      // Aplicar límites guardados
      for (const [provider, limit] of Object.entries(config.providerLimits)) {
        if (typeof limit === 'number') {
          globalQueueManager.setConcurrencyLimit(provider, limit);
        }
      }
      console.log('[Queue] Configuración cargada desde MongoDB:', config.providerLimits);
      return config;
    }
  } catch (error) {
    console.error('[Queue] Error cargando configuración:', error.message);
  }
  return null;
}

/**
 * GET /api/queue/stats
 * Obtiene estadísticas de todas las colas
 */
router.get('/stats', (req, res) => {
  try {
    const stats = globalQueueManager.getAllStats();

    res.json({
      success: true,
      timestamp: new Date().toISOString(),
      queues: stats,
      summary: {
        totalProviders: Object.keys(stats).length,
        totalRunning: Object.values(stats).reduce((sum, s) => sum + s.running, 0),
        totalQueued: Object.values(stats).reduce((sum, s) => sum + s.queued, 0)
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/queue/stats/:provider
 * Obtiene estadísticas de un provider específico
 */
router.get('/stats/:provider', (req, res) => {
  try {
    const { provider } = req.params;
    const stats = globalQueueManager.getStats(provider);

    if (!stats) {
      return res.status(404).json({
        success: false,
        error: `Provider '${provider}' no tiene cola activa`
      });
    }

    res.json({
      success: true,
      provider,
      ...stats
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * PUT /api/queue/limits/:provider
 * Actualiza el límite de concurrencia de un provider
 */
router.put('/limits/:provider', (req, res) => {
  try {
    const { provider } = req.params;
    const { limit } = req.body;

    if (typeof limit !== 'number' || limit < 1 || limit > 100) {
      return res.status(400).json({
        success: false,
        error: 'El límite debe ser un número entre 1 y 100'
      });
    }

    globalQueueManager.setConcurrencyLimit(provider, limit);

    console.log(`[Queue] Límite de concurrencia actualizado: ${provider} = ${limit}`);

    res.json({
      success: true,
      provider,
      limit,
      message: `Límite de concurrencia para '${provider}' actualizado a ${limit}`
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/queue/defaults
 * Obtiene los límites de concurrencia por defecto
 */
router.get('/defaults', (req, res) => {
  res.json({
    success: true,
    defaults: DEFAULT_CONCURRENCY_LIMITS
  });
});

/**
 * POST /api/queue/clear
 * Limpia todas las colas (emergency shutdown)
 */
router.post('/clear', (req, res) => {
  try {
    const statsBefore = globalQueueManager.getAllStats();
    const totalQueued = Object.values(statsBefore).reduce((sum, s) => sum + s.queued, 0);

    globalQueueManager.clearAll();

    console.log(`[Queue] ⚠️ Colas limpiadas (${totalQueued} tareas rechazadas)`);

    res.json({
      success: true,
      message: 'Todas las colas han sido limpiadas',
      rejectedTasks: totalQueued
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/queue/config
 * Obtiene la configuración actual de rate limiting
 */
router.get('/config', async (req, res) => {
  try {
    let config = await RateLimitConfig.findOne().sort({ updatedAt: -1 }).lean();

    // Si no hay configuración guardada, devolver la por defecto
    if (!config) {
      config = {
        providerLimits: DEFAULT_CONCURRENCY_LIMITS,
        globalEnabled: true,
        maxRetries: 3,
        enableFallback: true
      };
    }

    // Obtener límites actuales aplicados
    const currentStats = globalQueueManager.getAllStats();
    const currentLimits = {};
    for (const [provider, stats] of Object.entries(currentStats)) {
      currentLimits[provider] = stats.limit;
    }

    res.json({
      success: true,
      config: {
        providerLimits: config.providerLimits || DEFAULT_CONCURRENCY_LIMITS,
        globalEnabled: config.globalEnabled ?? true,
        maxRetries: config.maxRetries ?? 3,
        enableFallback: config.enableFallback ?? true
      },
      currentLimits,
      defaults: DEFAULT_CONCURRENCY_LIMITS,
      updatedAt: config.updatedAt
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/queue/config
 * Guarda la configuración de rate limiting
 */
router.post('/config', async (req, res) => {
  try {
    const { providerLimits, globalEnabled, maxRetries, enableFallback } = req.body;

    // Validar límites
    if (providerLimits) {
      for (const [provider, limit] of Object.entries(providerLimits)) {
        if (typeof limit !== 'number' || limit < 1 || limit > 100) {
          return res.status(400).json({
            success: false,
            error: `El límite para '${provider}' debe ser un número entre 1 y 100`
          });
        }
      }
    }

    // Guardar en MongoDB
    const config = await RateLimitConfig.findOneAndUpdate(
      {},
      {
        providerLimits: providerLimits || DEFAULT_CONCURRENCY_LIMITS,
        globalEnabled: globalEnabled !== undefined ? globalEnabled : true,
        maxRetries: maxRetries !== undefined ? maxRetries : 3,
        enableFallback: enableFallback !== undefined ? enableFallback : true,
        updatedAt: new Date()
      },
      { upsert: true, new: true }
    );

    // Aplicar límites al gestor de colas
    if (providerLimits) {
      for (const [provider, limit] of Object.entries(providerLimits)) {
        globalQueueManager.setConcurrencyLimit(provider, limit);
      }
    }

    console.log('[Queue] Configuración guardada y aplicada:', providerLimits);

    res.json({
      success: true,
      message: 'Configuración de rate limiting guardada',
      config: {
        providerLimits: config.providerLimits,
        globalEnabled: config.globalEnabled,
        maxRetries: config.maxRetries,
        enableFallback: config.enableFallback,
        updatedAt: config.updatedAt
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Cargar configuración al iniciar el servidor
loadAndApplyConfig().catch(err => {
  console.error('[Queue] Error al cargar configuración inicial:', err.message);
});

module.exports = router;
