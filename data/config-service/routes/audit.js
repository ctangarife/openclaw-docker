/**
 * Rutas para consultar audit logs
 */
const express = require("express");
const router = express.Router();
const { getAuditLogs, getEntityHistory, getAuditStats, cleanOldLogs } = require("../lib/audit-log");
const authMiddleware = require("../middleware/auth");

// Aplicar middleware de autenticación a todas las rutas
router.use(authMiddleware);

/**
 * GET /api/audit/logs
 * Obtiene logs de auditoría con filtros
 * Query params:
 * - action: Filtrar por acción
 * - entityType: Filtrar por tipo de entidad
 * - entityId: Filtrar por ID de entidad
 * - startDate: Fecha inicial (ISO string)
 * - endDate: Fecha final (ISO string)
 * - limit: Límite de resultados (default: 100)
 * - skip: Saltar N resultados (para paginación)
 */
router.get("/logs", async (req, res) => {
  try {
    const filters = {};

    if (req.query.action) {
      filters.action = req.query.action;
    }

    if (req.query.entityType) {
      filters.entityType = req.query.entityType;
    }

    if (req.query.entityId) {
      filters.entityId = req.query.entityId;
    }

    if (req.query.startDate) {
      filters.startDate = new Date(req.query.startDate);
    }

    if (req.query.endDate) {
      filters.endDate = new Date(req.query.endDate);
    }

    if (req.query.limit) {
      filters.limit = parseInt(req.query.limit, 10);
    }

    if (req.query.skip) {
      filters.skip = parseInt(req.query.skip, 10);
    }

    const { logs, total } = await getAuditLogs(filters);

    res.json({
      logs,
      total,
      filters,
      count: logs.length
    });

  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * GET /api/audit/stats
 * Obtiene estadísticas de auditoría
 * Query params:
 * - startDate: Fecha inicial (opcional)
 * - endDate: Fecha final (opcional)
 */
router.get("/stats", async (req, res) => {
  try {
    const filters = {};

    if (req.query.startDate) {
      filters.startDate = new Date(req.query.startDate);
    }

    if (req.query.endDate) {
      filters.endDate = new Date(req.query.endDate);
    }

    const stats = await getAuditStats(filters);
    res.json(stats);

  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * GET /api/audit/entity/:entityType/:entityId
 * Obtiene el historial de una entidad específica
 */
router.get("/entity/:entityType/:entityId", async (req, res) => {
  try {
    const { entityType, entityId } = req.params;
    const limit = req.query.limit ? parseInt(req.query.limit, 10) : 50;

    const { logs, total } = await getEntityHistory(entityType, entityId, limit);

    res.json({
      entityType,
      entityId,
      logs,
      total,
      count: logs.length
    });

  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * DELETE /api/audit/clean
 * Limpia logs antiguos (solo admin)
 * Query params:
 * - daysToKeep: Días a mantener (default: 90)
 */
router.delete("/clean", async (req, res) => {
  try {
    const daysToKeep = req.query.daysToKeep
      ? parseInt(req.query.daysToKeep, 10)
      : 90;

    if (daysToKeep < 7) {
      return res.status(400).json({ error: "daysToKeep debe ser al menos 7" });
    }

    const deletedCount = await cleanOldLogs(daysToKeep);

    res.json({
      success: true,
      deletedCount,
      message: `Eliminados ${deletedCount} logs antiguos (${daysToKeep} días o más)`
    });

  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
