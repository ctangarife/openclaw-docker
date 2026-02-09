/**
 * Endpoints para gestionar el contenedor de openclaw-gateway
 * Permite reiniciar, ejecutar comandos y verificar estado
 */

const express = require("express");
const router = express.Router();
const {
  restartGateway,
  execInGateway,
  checkGatewayStatus,
  getGatewayLogs,
  checkDockerAvailable
} = require("../lib/docker-utils");

// Verificar disponibilidad de Docker
router.get("/docker/check", async (req, res) => {
  try {
    const result = await checkDockerAvailable();
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Verificar estado del gateway
router.get("/status", async (req, res) => {
  try {
    const status = await checkGatewayStatus();
    res.json(status);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Reiniciar el gateway
router.post("/restart", async (req, res) => {
  try {
    const result = await restartGateway();
    if (result.success) {
      res.json({
        success: true,
        message: result.message
      });
    } else {
      res.status(500).json({
        success: false,
        error: result.error
      });
    }
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Ejecutar comando en el gateway
router.post("/exec", async (req, res) => {
  try {
    const { command, user, timeout } = req.body;
    
    if (!command) {
      return res.status(400).json({ error: "command es requerido" });
    }
    
    const result = await execInGateway(command, {
      user: user || 'node',
      timeout: timeout || 30000
    });
    
    if (result.success) {
      res.json({
        success: true,
        stdout: result.stdout,
        stderr: result.stderr
      });
    } else {
      res.status(500).json({
        success: false,
        error: result.error,
        stdout: result.stdout,
        stderr: result.stderr
      });
    }
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Obtener logs del gateway
router.get("/logs", async (req, res) => {
  try {
    const lines = parseInt(req.query.lines) || 50;
    const result = await getGatewayLogs(lines);
    
    if (result.success) {
      res.json({
        success: true,
        logs: result.logs
      });
    } else {
      res.status(500).json({
        success: false,
        error: result.error
      });
    }
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
