/**
 * Sistema de reintentos con exponential backoff
 * Para operaciones que pueden fallar transitoriamente (sync, restart, etc.)
 */

/**
 * Espera un tiempo determinado
 *
 * @param {number} ms - Milisegundos a esperar
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Ejecuta una función con reintentos y exponential backoff
 *
 * @param {Function} fn - Función a ejecutar (debe retornar Promise)
 * @param {object} options - Opciones de reintento
 * @param {number} [options.maxRetries=3] - Máximo número de reintentos
 * @param {number} [options.baseDelay=1000] - Delay inicial en ms
 * @param {number} [options.maxDelay=30000] - Delay máximo en ms
 * @param {number} [options.backoffMultiplier=2] - Multiplicador para backoff
 * @param {Function} [options.shouldRetry] - Función para determinar si reintentar (error) => boolean
 * @param {Function} [options.onRetry] - Callback antes de cada reintento (attempt, error) => void
 * @returns {Promise<any>} Resultado de la función
 */
async function retry(fn, options = {}) {
  const {
    maxRetries = 3,
    baseDelay = 1000,
    maxDelay = 30000,
    backoffMultiplier = 2,
    shouldRetry = () => true,
    onRetry = null
  } = options;

  let lastError;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      // Intento inicial o reintentos
      if (attempt > 0) {
        const delay = Math.min(
          baseDelay * Math.pow(backoffMultiplier, attempt - 1),
          maxDelay
        );

        console.log(`[Retry] Intento ${attempt}/${maxRetries} después de ${delay}ms`);

        if (onRetry) {
          onRetry(attempt, lastError);
        }

        await sleep(delay);
      }

      // Ejecutar la función
      const result = await fn();

      // Si llegamos aquí, fue exitoso
      if (attempt > 0) {
        console.log(`[Retry] Éxito en intento ${attempt}/${maxRetries}`);
      }

      return result;

    } catch (error) {
      lastError = error;

      // Determinar si debemos reintentar
      const isLastAttempt = attempt === maxRetries;

      if (!shouldRetry(error) || isLastAttempt) {
        // No reintentar o último intento falló
        if (attempt > 0) {
          console.error(`[Retry] Falló después de ${attempt} reintentos:`, error.message);
        }
        throw error;
      }

      // Continuar al siguiente intento
      console.error(`[Retry] Intento ${attempt + 1}/${maxRetries + 1} falló:`, error.message);
    }
  }

  // Esto nunca debería alcanzarse, pero por si acaso
  throw lastError;
}

/**
 * Wrapper específico para operaciones de sincronización con OpenClaw
 *
 * @param {Function} syncFn - Función de sincronización
 * @param {object} options - Opciones adicionales
 * @returns {Promise<any>}
 */
async function retrySync(syncFn, options = {}) {
  return retry(syncFn, {
    maxRetries: 3,
    baseDelay: 2000,
    maxDelay: 10000,
    backoffMultiplier: 2,
    shouldRetry: (error) => {
      // Reintentar en errores que pueden ser transitorios
      const retryableErrors = [
        'ECONNREFUSED',
        'ETIMEDOUT',
        'ECONNRESET',
        'ENOTFOUND',
        'gateway not ready',
        'container not running',
        'timeout',
        'network'
      ];

      const errorMessage = error.message?.toLowerCase() || '';
      const errorCode = error.code?.toUpperCase() || '';

      return retryableErrors.some(keyword =>
        errorMessage.includes(keyword.toLowerCase()) ||
        errorCode.includes(keyword)
      );
    },
    onRetry: (attempt, error) => {
      console.log(`[RetrySync] Reintentando sincronización (intento ${attempt}): ${error.message}`);
    },
    ...options
  });
}

/**
 * Wrapper específico para operaciones de reinicio de contenedores
 *
 * @param {Function} restartFn - Función de reinicio
 * @param {object} options - Opciones adicionales
 * @returns {Promise<any>}
 */
async function retryRestart(restartFn, options = {}) {
  return retry(restartFn, {
    maxRetries: 2,
    baseDelay: 3000,
    maxDelay: 5000,
    backoffMultiplier: 1,
    shouldRetry: (error) => {
      const errorMessage = error.message?.toLowerCase() || '';
      return errorMessage.includes('not running') ||
             errorMessage.includes('starting') ||
             errorMessage.includes('already in progress');
    },
    onRetry: (attempt, error) => {
      console.log(`[RetryRestart] Reintentando reinicio (intento ${attempt}): ${error.message}`);
    },
    ...options
  });
}

/**
 * Ejecuta múltiples operaciones con reintentos en paralelo
 * Útil para sincronizar y reiniciar simultáneamente
 *
 * @param {Array<Function>} functions - Array de funciones a ejecutar
 * @param {object} options - Opciones de reintento
 * @returns {Promise<Array>} Array de resultados
 */
async function retryParallel(functions, options = {}) {
  const results = await Promise.allSettled(
    functions.map(fn => retry(fn, options))
  );

  const successful = results.filter(r => r.status === 'fulfilled');
  const failed = results.filter(r => r.status === 'rejected');

  if (failed.length > 0) {
    console.warn(`[RetryParallel] ${successful.length}/${results.length} operaciones exitosas`);
    console.error(`[RetryParallel] Errores:`, failed.map(f => f.reason?.message));
  }

  // Retornar resultados o lanzar error si todas fallaron
  if (successful.length === 0) {
    throw new Error('Todas las operaciones fallaron');
  }

  return results.map(r => r.status === 'fulfilled' ? r.value : null);
}

/**
 * Configuración predefinida para diferentes tipos de operaciones
 */
const RetryPresets = {
  // Para llamadas HTTP a APIs externas (validación de keys, etc.)
  HTTP_REQUEST: {
    maxRetries: 2,
    baseDelay: 1000,
    maxDelay: 5000,
    backoffMultiplier: 2,
    shouldRetry: (error) => {
      const msg = error.message?.toLowerCase() || '';
      return msg.includes('timeout') ||
             msg.includes('econnreset') ||
             msg.includes('etimedout') ||
             error.code === 'ECONNRESET' ||
             error.code === 'ETIMEDOUT' ||
             error.name === 'AbortError';
    }
  },

  // Para operaciones de Docker
  DOCKER_OPERATION: {
    maxRetries: 3,
    baseDelay: 2000,
    maxDelay: 10000,
    backoffMultiplier: 2,
    shouldRetry: (error) => {
      const msg = error.message?.toLowerCase() || '';
      return msg.includes('not running') ||
             msg.includes('starting') ||
             msg.includes('container not found');
    }
  },

  // Para operaciones de base de datos
  DATABASE_OPERATION: {
    maxRetries: 5,
    baseDelay: 500,
    maxDelay: 5000,
    backoffMultiplier: 2,
    shouldRetry: (error) => {
      return error.code === 'ECONNREFUSED' ||
             error.message?.includes('connection') ||
             error.message?.includes('timed out');
    }
  }
};

/**
 * Ejecuta una función con un preset específico
 *
 * @param {Function} fn - Función a ejecutar
 * @param {string} presetName - Nombre del preset a usar
 * @param {object} customOptions - Opciones para sobrescribir el preset
 * @returns {Promise<any>}
 */
async function retryWithPreset(fn, presetName, customOptions = {}) {
  const preset = RetryPresets[presetName];

  if (!preset) {
    throw new Error(`Preset no encontrado: ${presetName}`);
  }

  return retry(fn, { ...preset, ...customOptions });
}

module.exports = {
  retry,
  retrySync,
  retryRestart,
  retryParallel,
  retryWithPreset,
  sleep,
  RetryPresets
};
