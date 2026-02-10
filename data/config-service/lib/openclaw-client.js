/**
 * Cliente unificado para OpenClaw Gateway con Rate Limiting y Retries
 *
 * Características:
 * - Cola FIFO por provider (anthropic, openai, etc.)
 * - Retries con backoff exponencial
 * - Fallback a modelo alternativo en caso de error (configurable desde app_config)
 * - Timeout configurable
 */

const axios = require('axios');
const mongoose = require('mongoose');
const { globalQueueManager, extractProvider } = require('./request-queue');

/**
 * Configuración de modelos fallback por provider (valores por defecto)
 * Si el modelo primario falla, se intenta con el fallback
 * NOTA: Estos valores se usan como fallback FINAL si no hay configuración en app_config
 */
const DEFAULT_FALLBACK_MODELS = {
  'anthropic': {
    // Si falla Sonnet, intentar con Haiku (más rápido y económico)
    'claude-3-5-sonnet-20241022': 'anthropic/claude-3-5-haiku-20241022',
    'claude-3-5-sonnet-20240620': 'anthropic/claude-3-haiku-20240307',
    'claude-3-opus-20240229': 'anthropic/claude-3-sonnet-20240229',
  },
  'openai': {
    // Si falla GPT-4, intentar con GPT-3.5
    'gpt-4-turbo': 'openai/gpt-3.5-turbo',
    'gpt-4': 'openai/gpt-3.5-turbo',
  }
};

// Schema de app_config para leer fallback models
const configSchema = new mongoose.Schema({
  key: String,
  value: mongoose.Schema.Types.Mixed
}, { collection: "app_config" });

// Caché de fallback chain desde app_config
let fallbackCache = {
  data: {
    fallbackModel1: null,
    fallbackModel2: null
  },
  lastUpdate: null,
  ttl: 60000 // 1 minuto
};

/**
 * Configuración de reintentos
 */
const RETRY_CONFIG = {
  maxRetries: 3,
  initialDelay: 1000,    // 1 segundo
  maxDelay: 10000,       // 10 segundos
  backoffMultiplier: 2,  // Doble el delay en cada retry
  retryableErrors: [
    'ECONNRESET',
    'ETIMEDOUT',
    'ECONNABORTED',
    'ENOTFOUND',
    'EAI_AGAIN'
  ],
  retryableStatusCodes: [
    429, // Too Many Requests
    500, // Internal Server Error
    502, // Bad Gateway
    503, // Service Unavailable
    504  // Gateway Timeout
  ]
};

/**
 * Calcula delay con backoff exponencial
 * Para 429 (rate limit), usa un delay más agresivo
 */
function getRetryDelay(attempt, isRateLimit = false) {
  let baseDelay = RETRY_CONFIG.initialDelay;

  // Si es rate limit (429), usar delay más largo para dar tiempo a recuperar
  if (isRateLimit) {
    baseDelay = 3000; // 3 segundos base para rate limits
  }

  const delay = baseDelay * Math.pow(RETRY_CONFIG.backoffMultiplier, attempt);
  return Math.min(delay, RETRY_CONFIG.maxDelay);
}

/**
 * Determina si un error es retryable
 */
function isRetryableError(error) {
  // Errores de red
  if (RETRY_CONFIG.retryableErrors.includes(error.code)) {
    return true;
  }

  // Status codes HTTP
  if (error.response && RETRY_CONFIG.retryableStatusCodes.includes(error.response.status)) {
    return true;
  }

  return false;
}

/**
 * Carga la cadena de fallback desde app_config
 * Lee fallbackModel1 y fallbackModel2 de la colección app_config
 */
async function loadFallbackModelsFromDB() {
  const now = Date.now();

  // Retornar caché si es válido
  if (fallbackCache.lastUpdate && (now - fallbackCache.lastUpdate) < fallbackCache.ttl) {
    return fallbackCache.data;
  }

  try {
    const Config = mongoose.model('Config', configSchema);

    // Leer fallbackModel1 y fallbackModel2 desde app_config
    const fb1Doc = await Config.findOne({ key: 'fallbackModel1' }).lean();
    const fb2Doc = await Config.findOne({ key: 'fallbackModel2' }).lean();

    const fallbackChain = {
      fallbackModel1: fb1Doc?.value || null,
      fallbackModel2: fb2Doc?.value || null
    };

    fallbackCache = {
      data: fallbackChain,
      lastUpdate: now
    };

    const configured = [fallbackChain.fallbackModel1, fallbackChain.fallbackModel2].filter(Boolean).length;
    console.log(`[OpenClawClient] 🔄 Fallback chain loaded from app_config: ${configured} fallback(s) configured`);
    return fallbackChain;
  } catch (error) {
    console.error('[OpenClawClient] Error loading fallback chain from DB:', error.message);
    return { fallbackModel1: null, fallbackModel2: null };
  }
}

/**
 * Obtiene la cadena completa de fallback para un modelo
 * Retorna un array con los modelos a intentar en orden
 */
async function getFallbackChain(model) {
  // Asegurar que el caché esté cargado
  await loadFallbackModelsFromDB();

  const chain = [];

  // Agregar fallbackModel1 si está configurado
  if (fallbackCache.data.fallbackModel1) {
    chain.push(fallbackCache.data.fallbackModel1);
  }

  // Agregar fallbackModel2 si está configurado
  if (fallbackCache.data.fallbackModel2) {
    chain.push(fallbackCache.data.fallbackModel2);
  }

  // Agregar fallback por defecto si no hay ninguno configurado
  if (chain.length === 0) {
    const defaultFallback = getDefaultFallbackModel(model);
    if (defaultFallback) {
      chain.push(defaultFallback);
    }
  }

  return chain;
}

/**
 * Obtiene el fallback por defecto (hardcoded) para un modelo
 */
function getDefaultFallbackModel(model) {
  const provider = extractProvider(model);
  const modelName = model.split('/').pop();

  // Usar defaults hardcoded
  const fallbacks = DEFAULT_FALLBACK_MODELS[provider];
  if (fallbacks && fallbacks[modelName]) {
    return fallbacks[modelName];
  }

  // Fallback genérico: usar Haiku para Anthropic, mini para OpenAI
  if (provider === 'anthropic') {
    return 'anthropic/claude-3-5-haiku-20241022';
  } else if (provider === 'openai') {
    return 'openai/gpt-3.5-turbo';
  }

  return null;
}

/**
 * Invalida el caché de fallback chain
 * Se debe llamar cuando se actualiza la configuración
 */
function invalidateFallbackCache() {
  fallbackCache.lastUpdate = null;
  console.log('[OpenClawClient] 🗑️ Fallback cache invalidated');
}

/**
 * Cliente de OpenClaw con cola y retries
 */
class OpenClawClient {
  constructor(options = {}) {
    this.gatewayUrl = options.gatewayUrl || process.env.OPENCLAW_GATEWAY_URL || 'http://openclaw-gateway:18789';
    this.gatewayToken = options.gatewayToken || process.env.OPENCLAW_GATEWAY_TOKEN;
    this.timeout = options.timeout || 60000;
    this.enableFallback = options.enableFallback !== false; // Habilitado por defecto
    this.maxRetries = options.maxRetries ?? RETRY_CONFIG.maxRetries;
    this.loadFallbackModels(); // Cargar fallback models al iniciar
  }

  /**
   * Carga los modelos de fallback desde MongoDB
   */
  async loadFallbackModels() {
    try {
      await loadFallbackModelsFromDB();
    } catch (error) {
      console.error('[OpenClawClient] Error loading fallback models:', error.message);
    }
  }

  /**
   * Invalida el caché de fallback models (para llamar cuando se actualizan credenciales)
   */
  invalidateFallbackCache() {
    invalidateFallbackCache();
  }

  /**
   * Envía un mensaje a OpenClaw
   * @param {Object} options - Opciones de la petición
   * @param {string} options.model - Modelo a usar (ej: "anthropic/claude-3-5-haiku")
   * @param {Array} options.messages - Mensajes de conversación
   * @param {number} options.maxTokens - Tokens máximos de respuesta
   * @param {Object} options.metadata - Metadatos adicionales
   * @returns {Promise<Object>} Respuesta de OpenClaw
   */
  async chat({ model, messages, maxTokens = 4096, metadata = {} }) {
    const startTime = Date.now();
    let lastError = null;

    // Intentar con el modelo primario y reintentos
    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        const response = await this._executeWithQueue(model, messages, maxTokens);
        const duration = Date.now() - startTime;

        console.log(`[OpenClawClient] ✅ Success (${duration}ms, attempt ${attempt + 1}): ${model}`);

        return {
          success: true,
          model: model,
          content: response.content,
          usage: response.usage,
          duration,
          attempts: attempt + 1
        };
      } catch (error) {
        lastError = error;

        // Si no es retryable o es el último intento, intentar fallback chain
        if (!isRetryableError(error) || attempt === this.maxRetries) {
          if (this.enableFallback) {
            // Obtener la cadena completa de fallback
            const fallbackChain = await getFallbackChain(model);

            for (const fallbackModel of fallbackChain) {
              if (fallbackModel && fallbackModel !== model) {
                console.log(`[OpenClawClient] ⚠️ Primary model failed, trying fallback: ${fallbackModel}`);

                try {
                  const response = await this._executeWithQueue(fallbackModel, messages, maxTokens);
                  const duration = Date.now() - startTime;

                  console.log(`[OpenClawClient] ✅ Fallback success (${duration}ms): ${fallbackModel}`);

                  return {
                    success: true,
                    model: fallbackModel,
                    content: response.content,
                    usage: response.usage,
                    duration,
                    attempts: attempt + 1,
                    fallback: true,
                    originalModel: model
                  };
                } catch (fallbackError) {
                  console.error(`[OpenClawClient] ❌ Fallback ${fallbackModel} also failed:`, fallbackError.message);
                  lastError = fallbackError;
                  // Continuar con el siguiente fallback en la cadena
                }
              }
            }
          }
          break; // Salir del loop de reintentos
        }

        // Esperar antes del siguiente retry
        // Si es 429 (rate limit), usar delay más agresivo
        const isRateLimit = error.response?.status === 429;
        const delay = getRetryDelay(attempt, isRateLimit);
        const rateLimitMsg = isRateLimit ? ' (RATE LIMIT)' : '';
        console.log(`[OpenClawClient] ⏳ Retry ${attempt + 1}/${this.maxRetries} after ${delay}ms${rateLimitMsg}: ${error.message}`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    // Todos los reintentos fallaron
    const duration = Date.now() - startTime;
    console.error(`[OpenClawClient] ❌ All retries failed (${duration}ms): ${lastError.message}`);

    throw new Error(`OpenClaw request failed after ${this.maxRetries + 1} attempts: ${lastError.message}`);
  }

  /**
   * Ejecuta la petición a través de la cola
   */
  async _executeWithQueue(model, messages, maxTokens) {
    return globalQueueManager.execute(model, async () => {
      return this._executeRequest(model, messages, maxTokens);
    });
  }

  /**
   * Ejecuta la petición HTTP a OpenClaw Gateway
   */
  async _executeRequest(model, messages, maxTokens) {
    const response = await axios.post(`${this.gatewayUrl}/v1/chat`, {
      model: model,
      max_tokens: maxTokens,
      messages: messages
    }, {
      headers: {
        'Authorization': `Bearer ${this.gatewayToken}`,
        'Content-Type': 'application/json'
      },
      timeout: this.timeout
    });

    return response.data;
  }

  /**
   * Obtiene estadísticas de las colas
   */
  getQueueStats(provider = null) {
    if (provider) {
      return globalQueueManager.getStats(provider);
    }
    return globalQueueManager.getAllStats();
  }

  /**
   * Actualiza el límite de concurrencia de un provider
   */
  setConcurrencyLimit(provider, limit) {
    globalQueueManager.setConcurrencyLimit(provider, limit);
  }
}

// Instancia global del cliente
const globalClient = new OpenClawClient();

// Inicializar carga de fallback models periódicamente
setInterval(async () => {
  await loadFallbackModelsFromDB();
}, 60000); // Cada 60 segundos

module.exports = {
  OpenClawClient,
  globalClient,
  extractProvider,
  getFallbackChain,
  getDefaultFallbackModel,
  getFallbackModel: getDefaultFallbackModel, // Para compatibilidad hacia atrás
  isRetryableError,
  loadFallbackModelsFromDB,
  invalidateFallbackCache,
  RETRY_CONFIG,
  DEFAULT_FALLBACK_MODELS,
  FALLBACK_MODELS: DEFAULT_FALLBACK_MODELS // Para compatibilidad hacia atrás
};
