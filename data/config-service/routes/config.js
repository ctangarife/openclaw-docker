const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");
const { invalidateFallbackCache } = require("../lib/openclaw-client");
const { getModelsFromOpenClawCatalog } = require("../lib/get-openclaw-models");

const schema = new mongoose.Schema(
  { key: String, value: mongoose.Schema.Types.Mixed },
  { timestamps: true, collection: "app_config" }
);
schema.index({ key: 1 }, { unique: true });
const Config = mongoose.models.Config || mongoose.model("Config", schema);

// ============================================================
// CACHÉ EN MEMORIA para modelos de OpenClaw
// ============================================================
const modelsCache = {
  data: null,
  timestamp: 0,
  TTL: 5 * 60 * 1000, // 5 minutos

  isValid() {
    return this.data && (Date.now() - this.timestamp < this.TTL);
  },

  set(data) {
    this.data = data;
    this.timestamp = Date.now();
  },

  clear() {
    this.data = null;
    this.timestamp = 0;
  }
};

/**
 * Obtiene modelos disponibles desde OpenClaw
 * @returns {Promise<Object>} Modelos agrupados por provider
 */
async function fetchModelsFromOpenClaw() {
  return await getModelsFromOpenClawCatalog();
}

router.get("/", async (req, res) => {
  try {
    const docs = await Config.find().lean();
    const map = {};
    docs.forEach((d) => (map[d.key] = d.value));
    res.json(map);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * GET /api/config/available-models
 * Retorna modelos disponibles, filtrando por credenciales habilitadas
 * PRIORIZA: Obtiene modelos desde OpenClaw usando 'openclaw models list'
 * FALLBACK: Usa provider-templates.js solo si el comando falla
 * MANEJO PRIMERA CONFIGURACIÓN: Retorna lista vacía sin error si no hay credenciales
 */
router.get("/available-models", async (req, res) => {
  try {
    console.log('[available-models] 📞 Endpoint llamado');

    // 1. Verificar caché
    if (modelsCache.isValid()) {
      console.log('[available-models] ⚡ Retornando desde caché');
      return res.json(modelsCache.data);
    }

    console.log('[available-models] 🔄 Generando lista de modelos...');

    // 2. Obtener credenciales habilitadas
    const Credential = mongoose.models.Credential || mongoose.model('Credential',
      new mongoose.Schema({
        provider: String,
        enabled: { type: Boolean, default: true }
      }, { collection: 'api_credentials' })
    );

    const credentials = await Credential.find({ enabled: true }).lean();
    const enabledProviders = new Set(credentials.map(c => c.provider));

    const hasCredentials = credentials.length > 0;
    console.log(`[available-models] 🔑 Providers habilitados: ${Array.from(enabledProviders).join(', ') || '(ninguno)'}`);

    // 3. Si no hay credenciales habilitadas, retornar lista vacía (primera configuración)
    if (!hasCredentials) {
      console.log('[available-models] ℹ️  No hay credenciales configuradas (primera configuración)');
      modelsCache.set({});
      return res.json({});
    }

    // 3. Invalidar caché si se solicita explícitamente
    if (req.query.invalidate === '1') {
      modelsCache.clear();
      console.log('[available-models] 🗑️  Caché invalidado por solicitud');
      return res.json({ message: 'Caché invalidado' });
    }

    // 4. Obtener modelos desde el catálogo dinámico de OpenClaw
    let allModels = await fetchModelsFromOpenClaw();

    // 5. Si OpenClaw falla o no retorna modelos, usar fallback con provider-templates.js
    if (!allModels || Object.keys(allModels).length === 0) {
      console.log('[available-models] ⚠️  OpenClaw no retornó modelos, usando fallback');
      const { NATIVE_PROVIDER_MODEL_LIST, PROVIDER_TEMPLATES } = require("../lib/provider-templates");

      const fallbackModels = {};

      // Agregar modelos nativos (solo providers habilitados)
      for (const [provider, models] of Object.entries(NATIVE_PROVIDER_MODEL_LIST)) {
        if (enabledProviders.has(provider)) {
          fallbackModels[provider] = models.map(m => ({
            id: `${provider}/${m.id}`,
            name: m.name
          }));
        }
      }

      // Agregar modelos personalizados (solo providers habilitados)
      for (const [provider, config] of Object.entries(PROVIDER_TEMPLATES)) {
        if (enabledProviders.has(provider)) {
          fallbackModels[provider] = config.models.map(m => ({
            id: `${provider}/${m.id}`,
            name: m.name
          }));
        }
      }

      allModels = fallbackModels;
      console.log(`[available-models] ✅ Fallback: ${Object.keys(allModels).length} providers habilitados`);
    }

    // 6. Filtrar solo providers habilitados
    const availableModels = {};
    for (const [provider, models] of Object.entries(allModels)) {
      if (enabledProviders.has(provider)) {
        availableModels[provider] = models;
      }
    }

    console.log(`[available-models] ✅ Retornando ${Object.keys(availableModels).length} providers habilitados`);

    // 7. Guardar en caché y retornar
    modelsCache.set(availableModels);
    res.json(availableModels);

  } catch (e) {
    console.error('[available-models] ❌ ERROR:', e);
    res.status(500).json({ error: e.message });
  }
});

router.put("/", async (req, res) => {
  try {
    const body = req.body;
    if (typeof body !== "object" || body === null) {
      return res.status(400).json({ error: "JSON object required" });
    }
    for (const [key, value] of Object.entries(body)) {
      await Config.findOneAndUpdate(
        { key },
        { $set: { value, updatedAt: new Date() } },
        { upsert: true, new: true }
      );
    }

    // Si se actualizó defaultAgentModel, sincronizar con OpenClaw y reiniciar gateway
    if (body.defaultAgentModel !== undefined) {
      const { syncAuthProfiles } = require("../lib/sync-openclaw-auth");
      const { restartGateway } = require("../lib/docker-utils");
      const agentDir = process.env.OPENCLAW_AGENT_DIR || "/home/node/.openclaw/agents/main/agent";
      const openclawJsonPath = "/home/node/.openclaw/openclaw.json";

      try {
        await syncAuthProfiles(agentDir, openclawJsonPath);
        console.log(`[PUT /config] Modelo por defecto actualizado a: ${body.defaultAgentModel}`);

        // Reiniciar gateway para aplicar el nuevo modelo
        const restartResult = await restartGateway();
        if (restartResult.success) {
          console.log(`[PUT /config] Gateway reiniciado exitosamente`);
        } else {
          console.error(`[PUT /config] Error reiniciando gateway: ${restartResult.error}`);
        }
      } catch (syncErr) {
        console.error(`[PUT /config] Error sincronizando después de actualizar modelo:`, syncErr.message);
        // No fallar la request, solo loguear el error
      }
    }

    // Si se actualizaron los modelos de fallback, invalidar el caché
    if (body.fallbackModel1 !== undefined || body.fallbackModel2 !== undefined) {
      invalidateFallbackCache();
      console.log(`[PUT /config] Caché de fallback invalidado por cambio en modelos de soporte`);
    }

    // Si se actualizaron credenciales, invalidar caché de modelos
    if (body.credentials !== undefined) {
      console.log('[PUT /config] 🗑️  Invalidando caché de modelos por cambio en credenciales');
      modelsCache.clear();
    }

    const docs = await Config.find().lean();
    const map = {};
    docs.forEach((d) => (map[d.key] = d.value));
    res.json(map);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
// Exportar función para invalidar caché (usado por credentials.js)
module.exports.clearModelsCache = () => {
  modelsCache.clear();
};
