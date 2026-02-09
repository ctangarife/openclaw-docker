/**
 * Rutas para notificaciones en tiempo real (Server-Sent Events)
 */
const express = require("express");
const router = express.Router();
const { sseManager, sseMiddleware, NotificationTypes } = require("../lib/notifications");

/**
 * GET /api/notifications/stream
 * Establece conexión SSE para recibir notificaciones en tiempo real
 *
 * Uso:
 * const eventSource = new EventSource('/api/notifications/stream');
 * eventSource.addEventListener('message', (e) => console.log(JSON.parse(e.data)));
 * eventSource.addEventListener('sync_completed', (e) => console.log('Sync!', JSON.parse(e.data)));
 */
router.get("/stream", sseMiddleware, (req, res) => {
  // El cliente ya fue registrado por el middleware
  const clientId = req.sseClientId;

  // Enviar estado actual del sistema
  setTimeout(() => {
    sseManager.sendToClient(clientId, {
      type: 'initial_state',
      clientId,
      stats: sseManager.getStats()
    }, 'system');
  }, 100);
});

/**
 * GET /api/notifications/stats
 * Obtiene estadísticas de conexiones SSE activas
 */
router.get("/stats", (req, res) => {
  res.json(sseManager.getStats());
});

/**
 * POST /api/notifications/broadcast
 * Envía una notificación a todos los clientes conectados
 * Body: { type: string, data: object }
 *
 * Útil para testing o para enviar notificaciones manuales
 */
router.post("/broadcast", (req, res) => {
  const { type, data } = req.body;

  if (!type) {
    return res.status(400).json({ error: "type is required" });
  }

  const count = sseManager.broadcast({
    type,
    ...data,
    timestamp: new Date().toISOString(),
    source: 'manual'
  }, type);

  res.json({
    success: true,
    notifiedClients: count,
    type,
    data
  });
});

/**
 * POST /api/notifications/test
 * Envía una notificación de prueba
 */
router.post("/test", (req, res) => {
  const { type = 'test', message = 'Test notification' } = req.body;

  sseManager.broadcast({
    type,
    message,
    timestamp: new Date().toISOString()
  }, type);

  res.json({
    success: true,
    message: 'Notificación de prueba enviada',
    type
  });
});

module.exports = router;
