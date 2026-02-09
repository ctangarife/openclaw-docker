/**
 * Sistema de Notificaciones en Tiempo Real
 * Usa Server-Sent Events (SSE) para enviar updates del servidor al cliente
 */

const EventEmitter = require('events');

/**
 * Gestor de conexiones SSE
 */
class SSEManager extends EventEmitter {
  constructor() {
    super();
    this.clients = new Map(); // clientId -> { response, lastEventId }
    this.clientIdCounter = 0;
  }

  /**
   * Registra un nuevo cliente SSE
   * @param {object} response - Express response object
   * @returns {number} Client ID
   */
  addClient(response) {
    const clientId = ++this.clientIdCounter;

    // Configurar headers SSE
    response.setHeader('Content-Type', 'text/event-stream');
    response.setHeader('Cache-Control', 'no-cache, no-transform');
    response.setHeader('Connection', 'keep-alive');
    response.setHeader('X-Accel-Buffering', 'no'); // Deshabilitar buffering en nginx

    // Enviar evento de conexión inicial
    this.sendToClient(clientId, {
      type: 'connected',
      clientId,
      timestamp: new Date().toISOString()
    });

    // Guardar cliente
    this.clients.set(clientId, {
      response,
      lastEventId: 0,
      connectedAt: new Date()
    });

    console.log(`[SSE] Cliente conectado: ${clientId} (total: ${this.clients.size})`);

    // Manejar desconexión
    response.on('close', () => {
      this.removeClient(clientId);
    });

    // Enviar heartbeat cada 30s para mantener conexión
    const heartbeatInterval = setInterval(() => {
      if (this.clients.has(clientId)) {
        this.sendToClient(clientId, { type: 'heartbeat' }, 'heartbeat');
      } else {
        clearInterval(heartbeatInterval);
      }
    }, 30000);

    return clientId;
  }

  /**
   * Elimina un cliente
   * @param {number} clientId
   */
  removeClient(clientId) {
    if (this.clients.has(clientId)) {
      this.clients.delete(clientId);
      console.log(`[SSE] Cliente desconectado: ${clientId} (total: ${this.clients.size})`);
      this.emit('client-disconnected', clientId);
    }
  }

  /**
   * Envía un evento a un cliente específico
   * @param {number} clientId
   * @param {object} data
   * @param {string} [eventType='message']
   */
  sendToClient(clientId, data, eventType = 'message') {
    const client = this.clients.get(clientId);
    if (!client) return false;

    try {
      const eventId = ++client.lastEventId;
      const message = this.formatSSE(eventId, eventType, data);
      client.response.write(message);
      return true;
    } catch (error) {
      console.error(`[SSE] Error enviando a cliente ${clientId}:`, error.message);
      this.removeClient(clientId);
      return false;
    }
  }

  /**
   * Envía un evento a todos los clientes conectados
   * @param {object} data
   * @param {string} [eventType='message']
   */
  broadcast(data, eventType = 'message') {
    const message = this.formatSSE(null, eventType, data);
    let successCount = 0;

    for (const [clientId, client] of this.clients.entries()) {
      try {
        client.response.write(message);
        successCount++;
      } catch (error) {
        console.error(`[SSE] Error en broadcast a cliente ${clientId}:`, error.message);
        this.removeClient(clientId);
      }
    }

    if (this.clients.size > 0) {
      console.log(`[SSE] Broadcast: ${successCount}/${this.clients.size} clientes`);
    }

    return successCount;
  }

  /**
   * Formatea datos como evento SSE
   * @param {number|null} eventId
   * @param {string} eventType
   * @param {object} data
   * @returns {string}
   */
  formatSSE(eventId, eventType, data) {
    let message = '';

    if (eventId !== null) {
      message += `id: ${eventId}\n`;
    }

    message += `event: ${eventType}\n`;
    message += `data: ${JSON.stringify(data)}\n\n`;

    return message;
  }

  /**
   * Obtiene estadísticas de conexiones
   */
  getStats() {
    return {
      totalClients: this.clients.size,
      clients: Array.from(this.clients.entries()).map(([id, client]) => ({
        id,
        connectedAt: client.connectedAt,
        lastEventId: client.lastEventId
      }))
    };
  }
}

// Instancia singleton del gestor SSE
const sseManager = new SSEManager();

/**
 * Tipos de notificaciones
 */
const NotificationTypes = {
  // Credenciales
  CREDENTIAL_CREATED: 'credential_created',
  CREDENTIAL_UPDATED: 'credential_updated',
  CREDENTIAL_DELETED: 'credential_deleted',
  CREDENTIAL_ENABLED: 'credential_enabled',
  CREDENTIAL_DISABLED: 'credential_disabled',

  // Sincronización
  SYNC_STARTED: 'sync_started',
  SYNC_PROGRESS: 'sync_progress',
  SYNC_COMPLETED: 'sync_completed',
  SYNC_FAILED: 'sync_failed',

  // Gateway
  GATEWAY_RESTARTING: 'gateway_restarting',
  GATEWAY_RESTARTED: 'gateway_restarted',
  GATEWAY_RESTART_FAILED: 'gateway_restart_failed',

  // Configuración
  CONFIG_UPDATED: 'config_updated',
  MODEL_CHANGED: 'model_changed',

  // Sistema
  HEALTH_CHANGED: 'health_changed',
  ERROR: 'error'
};

/**
 * Envía una notificación a todos los clientes conectados
 * @param {string} type - Tipo de notificación
 * @param {object} data - Datos de la notificación
 */
function notify(type, data = {}) {
  sseManager.broadcast({
    type,
    ...data,
    timestamp: new Date().toISOString()
  }, type);
}

/**
 * Envía una notificación de progreso
 * @param {string} operation - Operación en progreso
 * @param {number} progress - Progreso (0-100)
 * @param {string} message - Mensaje descriptivo
 */
function notifyProgress(operation, progress, message) {
  notify(NotificationTypes.SYNC_PROGRESS, {
    operation,
    progress,
    message
  });
}

/**
 * Wrapper para operaciones con notificaciones de progreso
 * @param {string} operation - Nombre de la operación
 * @param {Function} fn - Función a ejecutar
 * @param {Function} [progressFn] - Función opcional para reportar progreso
 */
async function withProgressNotifications(operation, fn, progressFn = null) {
  notify(NotificationTypes.SYNC_STARTED, { operation });

  try {
    const result = await fn();

    notify(NotificationTypes.SYNC_COMPLETED, {
      operation,
      result
    });

    return result;
  } catch (error) {
    notify(NotificationTypes.SYNC_FAILED, {
      operation,
      error: error.message
    });

    throw error;
  }
}

/**
 * Middleware de Express para endpoints SSE
 * Maneja reconexión automática con Last-Event-ID
 */
function sseMiddleware(req, res, next) {
  const lastEventId = req.headers['last-event-id'];

  if (lastEventId) {
    console.log(`[SSE] Reconexión solicitada desde evento ${lastEventId}`);
    // Podríamos reenviar eventos perdidos aquí si los guardamos
  }

  // Registrar cliente
  const clientId = sseManager.addClient(res);
  req.sseClientId = clientId;

  next();
}

module.exports = {
  sseManager,
  SSEManager,
  NotificationTypes,
  notify,
  notifyProgress,
  withProgressNotifications,
  sseMiddleware
};
