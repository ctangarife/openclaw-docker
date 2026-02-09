/**
 * Sistema de Auditoría - Registra todos los cambios importantes
 * Guarda en MongoDB para trazabilidad completa
 */

const mongoose = require('mongoose');

// Schema para audit log
const auditLogSchema = new mongoose.Schema({
  // Acción realizada: credential_created, credential_updated, credential_deleted,
  // credential_enabled, credential_disabled, sync_completed, sync_failed, etc.
  action: {
    type: String,
    required: true,
    index: true
  },

  // Tipo de entidad afectada: credential, config, gateway
  entityType: {
    type: String,
    required: true,
    index: true
  },

  // ID de la entidad afectada
  entityId: {
    type: String,
    index: true
  },

  // Cambios realizados (before/after para actualizaciones)
  changes: {
    before: mongoose.Schema.Types.Mixed,
    after: mongoose.Schema.Types.Mixed
  },

  // Metadata adicional
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },

  // Información del request
  request: {
    ip: String,
    userAgent: String,
    method: String,
    path: String
  },

  // Resultado de la operación
  result: {
    type: String,
    enum: ['success', 'failure', 'partial'],
    default: 'success'
  },

  // Mensaje de error si falló
  error: String,

  // Timestamp automático de Mongoose
  timestamp: {
    type: Date,
    default: Date.now,
    index: true
  }
}, {
  collection: 'audit_log',
  timestamps: false // Usamos nuestro propio campo 'timestamp'
});

// Índice compuesto para búsquedas comunes
auditLogSchema.index({ action: 1, timestamp: -1 });
auditLogSchema.index({ entityType: 1, entityId: 1, timestamp: -1 });

const AuditLog = mongoose.models.AuditLog || mongoose.model('AuditLog', auditLogSchema);

/**
 * Crea un registro de auditoría
 *
 * @param {object} options - Opciones del log
 * @param {string} options.action - Acción realizada
 * @param {string} options.entityType - Tipo de entidad
 * @param {string} [options.entityId] - ID de la entidad
 * @param {object} [options.changes] - Cambios realizados
 * @param {object} [options.metadata] - Metadata adicional
 * @param {object} [options.request] - Info del request HTTP
 * @param {string} [options.result] - Resultado de la operación
 * @param {string} [options.error] - Mensaje de error
 * @returns {Promise<object>} El log creado
 */
async function createAuditLog(options) {
  try {
    const log = await AuditLog.create({
      action: options.action,
      entityType: options.entityType,
      entityId: options.entityId,
      changes: options.changes || {},
      metadata: options.metadata || {},
      request: options.request || {},
      result: options.result || 'success',
      error: options.error
    });

    console.log(`[AuditLog] ${options.action} - ${options.entityType}${options.entityId ? `:${options.entityId}` : ''}`);

    // Enviar notificación SSE si el módulo de notificaciones está disponible
    try {
      const { sseManager } = require('./notifications');
      sseManager.broadcast({
        type: 'audit_log',
        action: options.action,
        entityType: options.entityType,
        entityId: options.entityId,
        result: options.result || 'success',
        timestamp: new Date().toISOString()
      }, options.action);
    } catch (notifError) {
      // Silencioso - las notificaciones son opcionales
    }

    return log;

  } catch (error) {
    // No fallar el sistema si falla el audit log
    console.error('[AuditLog] Error creando registro:', error.message);
    return null;
  }
}

/**
 * Obtiene logs de auditoría con filtros
 *
 * @param {object} filters - Filtros de búsqueda
 * @param {string} [filters.action] - Filtrar por acción
 * @param {string} [filters.entityType] - Filtrar por tipo de entidad
 * @param {string} [filters.entityId] - Filtrar por ID de entidad
 * @param {Date} [filters.startDate] - Fecha inicial
 * @param {Date} [filters.endDate] - Fecha final
 * @param {number} [filters.limit] - Límite de resultados (default: 100)
 * @param {number} [filters.skip] - Saltar N resultados
 * @returns {Promise<Array>} Lista de logs
 */
async function getAuditLogs(filters = {}) {
  try {
    const query = {};

    if (filters.action) {
      query.action = filters.action;
    }

    if (filters.entityType) {
      query.entityType = filters.entityType;
    }

    if (filters.entityId) {
      query.entityId = filters.entityId;
    }

    if (filters.startDate || filters.endDate) {
      query.timestamp = {};
      if (filters.startDate) {
        query.timestamp.$gte = filters.startDate;
      }
      if (filters.endDate) {
        query.timestamp.$lte = filters.endDate;
      }
    }

    const limit = filters.limit || 100;
    const skip = filters.skip || 0;

    const logs = await AuditLog
      .find(query)
      .sort({ timestamp: -1 })
      .limit(limit)
      .skip(skip)
      .lean();

    // Total de documentos (para paginación)
    const total = await AuditLog.countDocuments(query);

    return { logs, total };

  } catch (error) {
    console.error('[AuditLog] Error obteniendo logs:', error.message);
    return { logs: [], total: 0 };
  }
}

/**
 * Obtiene logs de auditoría para una entidad específica
 *
 * @param {string} entityType - Tipo de entidad
 * @param {string} entityId - ID de la entidad
 * @param {number} [limit] - Límite de resultados
 * @returns {Promise<Array>} Lista de logs
 */
async function getEntityHistory(entityType, entityId, limit = 50) {
  return getAuditLogs({
    entityType,
    entityId,
    limit
  });
}

/**
 * Limpya logs antiguos de auditoría
 *
 * @param {number} daysToKeep - Días a mantener (default: 90)
 * @returns {Promise<number>} Cantidad de logs eliminados
 */
async function cleanOldLogs(daysToKeep = 90) {
  try {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

    const result = await AuditLog.deleteMany({
      timestamp: { $lt: cutoffDate }
    });

    console.log(`[AuditLog] Eliminados ${result.deletedCount} logs antiguos (${daysToKeep} días)`);

    return result.deletedCount;

  } catch (error) {
    console.error('[AuditLog] Error limpiando logs antiguos:', error.message);
    return 0;
  }
}

/**
 * Obtiene estadísticas de auditoría
 *
 * @param {object} filters - Filtros opcionales
 * @returns {Promise<object>} Estadísticas
 */
async function getAuditStats(filters = {}) {
  try {
    const matchStage = {};

    if (filters.startDate || filters.endDate) {
      matchStage.timestamp = {};
      if (filters.startDate) {
        matchStage.timestamp.$gte = filters.startDate;
      }
      if (filters.endDate) {
        matchStage.timestamp.$lte = filters.endDate;
      }
    }

    const stats = await AuditLog.aggregate([
      { $match: matchStage },
      {
        $group: {
          _id: '$action',
          count: { $sum: 1 },
          success: {
            $sum: { $cond: [{ $eq: ['$result', 'success'] }, 1, 0] }
          },
          failure: {
            $sum: { $cond: [{ $eq: ['$result', 'failure'] }, 1, 0] }
          }
        }
      },
      { $sort: { count: -1 } }
    ]);

    // Total general
    const total = await AuditLog.countDocuments(matchStage);

    return {
      total,
      byAction: stats,
      period: {
        start: filters.startDate,
        end: filters.endDate
      }
    };

  } catch (error) {
    console.error('[AuditLog] Error obteniendo estadísticas:', error.message);
    return { total: 0, byAction: [] };
  }
}

// Middleware de Express para automaticamente loggear requests
function auditMiddleware(options = {}) {
  return async (req, res, next) => {
    // Guardar el JSON original del body
    const originalJson = res.json;
    let responseData = null;

    // Interceptar res.json para capturar la respuesta
    res.json = function(data) {
      responseData = data;
      return originalJson.call(this, data);
    };

    // Continuar con el request
    res.on('finish', async () => {
      // Solo loggear si el endpoint lo requiere
      const shouldAudit = options.shouldAudit
        ? options.shouldAudit(req, res)
        : req.method !== 'GET' && req.path.startsWith('/api/'); // Por defecto: loggear POST/PUT/PATCH/DELETE en /api/

      if (!shouldAudit) return;

      // Determinar acción basado en método y ruta
      const action = determineAction(req);

      if (!action) return;

      await createAuditLog({
        action,
        entityType: determineEntityType(req.path),
        entityId: req.params.id || req.params._id,
        changes: req.method === 'PATCH' || req.method === 'PUT'
          ? { before: req.body.before, after: req.body }
          : { data: req.body },
        metadata: {
          statusCode: res.statusCode,
          responseTime: Date.now() - req.startTime
        },
        request: {
          ip: req.ip,
          userAgent: req.get('user-agent'),
          method: req.method,
          path: req.path
        },
        result: res.statusCode < 400 ? 'success' : 'failure',
        error: responseData?.error
      });
    });

    // Marcar tiempo de inicio
    req.startTime = Date.now();
    next();
  };
}

function determineAction(req) {
  const path = req.path;
  const method = req.method;

  if (path.includes('/credentials')) {
    if (method === 'POST') return 'credential_created';
    if (method === 'PATCH') {
      if (req.body?.enabled !== undefined) {
        return req.body.enabled ? 'credential_enabled' : 'credential_disabled';
      }
      return 'credential_updated';
    }
    if (method === 'DELETE') return 'credential_deleted';
  }

  if (path.includes('/config')) {
    if (method === 'PUT') return 'config_updated';
  }

  if (path.includes('/sync')) {
    return 'sync_completed';
  }

  return null;
}

function determineEntityType(path) {
  if (path.includes('/credentials')) return 'credential';
  if (path.includes('/config')) return 'config';
  if (path.includes('/gateway')) return 'gateway';
  return 'unknown';
}

module.exports = {
  AuditLog,
  createAuditLog,
  getAuditLogs,
  getEntityHistory,
  cleanOldLogs,
  getAuditStats,
  auditMiddleware
};
