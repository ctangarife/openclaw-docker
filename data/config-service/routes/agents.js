const express = require("express");
const router = express.Router();
const { getAgentsInfo, createAgent, deleteAgent, listAgents, restartGateway } = require("../lib/docker-utils");
const { sseManager } = require("../lib/notifications");

/**
 * GET /api/agents
 * Lista todos los agentes de OpenClaw
 */
router.get("/", async (req, res) => {
  try {
    const result = await getAgentsInfo();

    if (result.success) {
      res.json({
        success: true,
        agents: result.agents,
        bindings: result.bindings
      });
    } else {
      res.status(500).json({
        success: false,
        error: result.error || "Error al obtener agentes"
      });
    }
  } catch (e) {
    console.error("[GET /api/agents] Error:", e);
    res.status(500).json({ success: false, error: e.message });
  }
});

/**
 * GET /api/agents/list
 * Alias para listar solo los agentes (sin bindings)
 */
router.get("/list", async (req, res) => {
  try {
    const result = await listAgents();

    if (result.success) {
      res.json({
        success: true,
        agents: result.agents
      });
    } else {
      res.status(500).json({
        success: false,
        error: result.error || "Error al listar agentes"
      });
    }
  } catch (e) {
    console.error("[GET /api/agents/list] Error:", e);
    res.status(500).json({ success: false, error: e.message });
  }
});

/**
 * POST /api/agents
 * Crea un nuevo agente en OpenClaw
 * Body: { id: string, name?: string, workspace?: string, model?: string }
 */
router.post("/", async (req, res) => {
  try {
    const { id, name, workspace, model } = req.body;

    if (!id) {
      return res.status(400).json({
        success: false,
        error: "El campo 'id' es requerido"
      });
    }

    // Validar que el ID solo contenga caracteres alfanuméricos y guiones
    if (!/^[a-z0-9-]+$/.test(id)) {
      return res.status(400).json({
        success: false,
        error: "El ID del agente solo puede contener letras minúsculas, números y guiones"
      });
    }

    console.log(`[POST /api/agents] Creando agente: ${id}`);

    const result = await createAgent(id, { name, workspace, model });

    if (result.success) {
      // Notificar creación
      try {
        sseManager.broadcast({
          type: 'agent_created',
          agentId: id,
          message: `Agente ${id} creado exitosamente`,
          timestamp: new Date().toISOString()
        }, 'agent_created');
      } catch (e) {}

      // Reiniciar gateway para aplicar cambios
      console.log(`[POST /api/agents] Reiniciando gateway...`);
      const restartResult = await restartGateway();

      res.status(201).json({
        success: true,
        message: `Agente ${id} creado exitosamente${restartResult.success ? ' y gateway reiniciado' : ''}`,
        agent: result.agent,
        gatewayRestarted: restartResult.success
      });
    } else {
      res.status(500).json({
        success: false,
        error: result.error || "Error al crear agente"
      });
    }
  } catch (e) {
    console.error("[POST /api/agents] Error:", e);
    res.status(500).json({ success: false, error: e.message });
  }
});

/**
 * DELETE /api/agents/:id
 * Elimina un agente de OpenClaw
 */
router.delete("/:id", async (req, res) => {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({
        success: false,
        error: "ID de agente no especificado"
      });
    }

    // No permitir eliminar el agente 'main'
    if (id === 'main') {
      return res.status(400).json({
        success: false,
        error: "No se puede eliminar el agente 'main'"
      });
    }

    console.log(`[DELETE /api/agents/:id] Eliminando agente: ${id}`);

    const result = await deleteAgent(id);

    if (result.success) {
      // Notificar eliminación
      try {
        sseManager.broadcast({
          type: 'agent_deleted',
          agentId: id,
          message: `Agente ${id} eliminado`,
          timestamp: new Date().toISOString()
        }, 'agent_deleted');
      } catch (e) {}

      // Reiniciar gateway para aplicar cambios
      console.log(`[DELETE /api/agents/:id] Reiniciando gateway...`);
      const restartResult = await restartGateway();

      res.json({
        success: true,
        message: `Agente ${id} eliminado${restartResult.success ? ' y gateway reiniciado' : ''}`,
        gatewayRestarted: restartResult.success
      });
    } else {
      res.status(500).json({
        success: false,
        error: result.error || "Error al eliminar agente"
      });
    }
  } catch (e) {
    console.error("[DELETE /api/agents/:id] Error:", e);
    res.status(500).json({ success: false, error: e.message });
  }
});

/**
 * GET /api/agents/bindings
 * Lista los bindings de routing de OpenClaw
 */
router.get("/bindings", async (req, res) => {
  try {
    const result = await listBindings();

    if (result.success) {
      res.json({
        success: true,
        bindings: result.bindings
      });
    } else {
      res.status(500).json({
        success: false,
        error: result.error || "Error al obtener bindings"
      });
    }
  } catch (e) {
    console.error("[GET /api/agents/bindings] Error:", e);
    res.status(500).json({ success: false, error: e.message });
  }
});

module.exports = router;
