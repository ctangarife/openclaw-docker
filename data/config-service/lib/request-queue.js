/**
 * Sistema de Colas FIFO para Rate Limiting por Provider/API Key
 *
 * Gestiona las peticiones a OpenClaw con límites de concurrencia por provider
 * para no exceder los rate limits de las APIs de LLM (Anthropic, OpenAI, etc.)
 */

/**
 * Extrae el provider desde el modelo (ej: "anthropic/claude-3-5-haiku" -> "anthropic")
 * @param {string} model - Modelo en formato provider/model
 * @returns {string} Provider name
 */
function extractProvider(model) {
  if (!model) return 'unknown';
  const parts = model.split('/');
  return parts[0] || 'unknown';
}

/**
 * Límites de concurrencia por provider (configurables)
 * Estos son límites conservadores para evitar rate limits
 */
const DEFAULT_CONCURRENCY_LIMITS = {
  'anthropic': 5,      // Anthropic API: ~5 concurrentes por defecto
  'openai': 10,        // OpenAI API: ~10 concurrentes por defecto
  'minimax': 3,        // MiniMax: límite más bajo
  'groq': 10,          // Groq: alta concurrencia
  'openrouter': 5,     // OpenRouter: depende del plan
  'default': 5         // Límite por defecto para providers desconocidos
};

/**
 * Cola FIFO para un provider específico
 */
class ProviderQueue {
  constructor(provider, concurrencyLimit) {
    this.provider = provider;
    this.concurrencyLimit = concurrencyLimit;
    this.running = 0;
    this.queue = [];
  }

  /**
   * Agrega una petición a la cola
   * @param {Function} task - Función async que ejecuta la petición
   * @returns {Promise} Resultado de la tarea
   */
  async enqueue(task) {
    return new Promise((resolve, reject) => {
      this.queue.push({ task, resolve, reject });
      this.process();
    });
  }

  /**
   * Procesa la cola FIFO
   */
  async process() {
    // Si ya estamos en el límite de concurrencia o no hay tareas pendientes
    if (this.running >= this.concurrencyLimit || this.queue.length === 0) {
      return;
    }

    // Obtener la siguiente tarea (FIFO)
    const { task, resolve, reject } = this.queue.shift();

    this.running++;

    try {
      const result = await task();
      resolve(result);
    } catch (error) {
      reject(error);
    } finally {
      this.running--;
      // Procesar la siguiente tarea en la cola
      this.process();
    }
  }

  /**
   * Estadísticas de la cola
   */
  getStats() {
    return {
      provider: this.provider,
      running: this.running,
      queued: this.queue.length,
      limit: this.concurrencyLimit
    };
  }

  /**
   * Limpia la cola (para shutdown)
   */
  clear() {
    // Rechazar todas las tareas pendientes
    for (const { reject } of this.queue) {
      reject(new Error('Queue cleared'));
    }
    this.queue = [];
  }
}

/**
 * Gestor central de colas por provider
 */
class RequestQueueManager {
  constructor(concurrencyLimits = {}) {
    this.queues = new Map();
    this.concurrencyLimits = { ...DEFAULT_CONCURRENCY_LIMITS, ...concurrencyLimits };
  }

  /**
   * Obtiene o crea la cola para un provider
   */
  getQueue(provider) {
    if (!this.queues.has(provider)) {
      const limit = this.concurrencyLimits[provider] || this.concurrencyLimits['default'];
      this.queues.set(provider, new ProviderQueue(provider, limit));
    }
    return this.queues.get(provider);
  }

  /**
   * Ejecuta una tarea en la cola correspondiente al provider
   * @param {string} model - Modelo a usar (ej: "anthropic/claude-3-5-haiku")
   * @param {Function} task - Función async que ejecuta la petición
   * @returns {Promise} Resultado de la tarea
   */
  async execute(model, task) {
    const provider = extractProvider(model);
    const queue = this.getQueue(provider);

    console.log(`[RequestQueue] ${provider}: ejecutando (running: ${queue.getStats().running}, queued: ${queue.getStats().queued})`);

    return queue.enqueue(task);
  }

  /**
   * Estadísticas de todas las colas
   */
  getAllStats() {
    const stats = {};
    for (const [provider, queue] of this.queues.entries()) {
      stats[provider] = queue.getStats();
    }
    return stats;
  }

  /**
   * Estadísticas de un provider específico
   */
  getStats(provider) {
    const queue = this.queues.get(provider);
    return queue ? queue.getStats() : null;
  }

  /**
   * Actualiza el límite de concurrencia de un provider
   */
  setConcurrencyLimit(provider, limit) {
    this.concurrencyLimits[provider] = limit;
    // Si ya existe una cola, actualizar su límite
    const queue = this.queues.get(provider);
    if (queue) {
      queue.concurrencyLimit = limit;
    }
  }

  /**
   * Limpia todas las colas
   */
  clearAll() {
    for (const queue of this.queues.values()) {
      queue.clear();
    }
    this.queues.clear();
  }
}

// Instancia global del gestor de colas
const globalQueueManager = new RequestQueueManager();

module.exports = {
  RequestQueueManager,
  ProviderQueue,
  globalQueueManager,
  extractProvider,
  DEFAULT_CONCURRENCY_LIMITS
};
