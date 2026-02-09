/**
 * Validación de API Keys para diferentes providers
 * Realiza una llamada de prueba al API del provider para verificar que la key es válida
 */

const API_TIMEOUT = 10000; // 10 segundos

/**
 * Configuración de validación por provider
 */
const PROVIDER_VALIDATION_CONFIG = {
  'anthropic': {
    url: 'https://api.anthropic.com/v1/messages',
    method: 'POST',
    headers: {
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json'
    },
    body: {
      model: 'claude-3-haiku-20240307',
      max_tokens: 1,
      messages: [{ role: 'user', content: 'test' }]
    },
    validateResponse: (response) => {
      // 200 OK, 401 Unauthorized (invalid key), 429 Rate limit (key exists but rate limited)
      return response.status === 200 || response.status === 429;
    }
  },
  'anthropic-oauth': {
    // OAuth no se puede validar fácilmente sin el flow completo
    skipValidation: true
  },
  'anthropic-token': {
    skipValidation: true // Setup token se valida al usarlo
  },
  'openai': {
    url: 'https://api.openai.com/v1/models',
    method: 'GET',
    headers: {},
    validateResponse: (response) => {
      return response.status === 200 || response.status === 401;
    }
  },
  'openai-codex-cli': {
    skipValidation: true // Usa credenciales del sistema
  },
  'openai-codex-oauth': {
    skipValidation: true // OAuth flow
  },
  'zai': {
    url: 'https://open.bigmodel.cn/api/paas/v4/models',
    method: 'GET',
    headers: {},
    validateResponse: (response) => {
      return response.status === 200 || response.status === 401;
    }
  },
  'google': {
    url: 'https://generativelanguage.googleapis.com/v1beta/models',
    method: 'GET',
    headers: {},
    // Google API key va en URL, pero la validación básica es similar
    skipValidation: true // Requiere configuración especial
  },
  'minimax': {
    url: 'https://api.minimax.chat/v1/text/chatcompletion_v2',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: {
      model: 'abab6.5s-chat',
      tokens_to_generate: 1,
      messages: [{ role: 'user', content: 'hi' }]
    },
    validateResponse: (response) => {
      return response.status === 200 || response.status === 401;
    }
  },
  'moonshot': {
    url: 'https://api.moonshot.cn/v1/models',
    method: 'GET',
    headers: {},
    validateResponse: (response) => {
      return response.status === 200 || response.status === 401;
    }
  },
  'kimi-coding': {
    url: 'https://api.moonshot.cn/v1/models',
    method: 'GET',
    headers: {},
    validateResponse: (response) => {
      return response.status === 200 || response.status === 401;
    }
  },
  'synthetic': {
    url: 'https://api.synthetic.ai/v1/models',
    method: 'GET',
    headers: {},
    validateResponse: (response) => {
      return response.status === 200 || response.status === 401;
    }
  },
  'opencode-zen': {
    url: 'https://api.opencode.ai/v1/models',
    method: 'GET',
    headers: {},
    validateResponse: (response) => {
      return response.status === 200 || response.status === 401;
    }
  },
  'vercel-ai-gateway': {
    url: 'https://gateway.vercel.ai/api/v1/models',
    method: 'GET',
    headers: {},
    validateResponse: (response) => {
      return response.status === 200 || response.status === 401;
    }
  },
  'cloudflare-ai-gateway': {
    skipValidation: true // Requiere Account ID y Gateway ID, validación especial
  },
  'groq': {
    url: 'https://api.groq.com/openai/v1/models',
    method: 'GET',
    headers: {},
    validateResponse: (response) => {
      return response.status === 200 || response.status === 401;
    }
  },
  'xai': {
    url: 'https://api.x.ai/v1/models',
    method: 'GET',
    headers: {},
    validateResponse: (response) => {
      return response.status === 200 || response.status === 401;
    }
  },
  'cerebras': {
    url: 'https://api.cerebras.ai/v1/models',
    method: 'GET',
    headers: {},
    validateResponse: (response) => {
      return response.status === 200 || response.status === 401;
    }
  },
  'mistral': {
    url: 'https://api.mistral.ai/v1/models',
    method: 'GET',
    headers: {},
    validateResponse: (response) => {
      return response.status === 200 || response.status === 401;
    }
  },
  'deepseek': {
    url: 'https://api.deepseek.com/v1/models',
    method: 'GET',
    headers: {},
    validateResponse: (response) => {
      return response.status === 200 || response.status === 401;
    }
  },
  'openrouter': {
    url: 'https://openrouter.ai/api/v1/models',
    method: 'GET',
    headers: {},
    validateResponse: (response) => {
      return response.status === 200 || response.status === 401;
    }
  },
  'generic': {
    skipValidation: true // No se puede validar un provider genérico
  }
};

/**
 * Valida una API key haciendo una llamada de prueba al provider
 *
 * @param {string} provider - Nombre del provider
 * @param {string} token - API key a validar
 * @param {object} metadata - Metadata adicional (ej: Account ID para Cloudflare)
 * @returns {Promise<{valid: boolean, error?: string, details?: any}>}
 */
async function validateProviderKey(provider, token, metadata = {}) {
  const config = PROVIDER_VALIDATION_CONFIG[provider];

  // Si el provider no tiene configuración de validación, asumir válido
  if (!config) {
    return {
      valid: true,
      warning: `No hay configuración de validación para provider: ${provider}`
    };
  }

  // Si el provider debe saltarse validación
  if (config.skipValidation) {
    return {
      valid: true,
      info: `Provider ${provider} no requiere validación de API key`
    };
  }

  if (!token || token.trim() === '') {
    return {
      valid: false,
      error: 'La API key está vacía'
    };
  }

  try {
    const headers = {
      ...(config.headers || {}),
      'Authorization': `Bearer ${token.trim()}`
    };

    const requestOptions = {
      method: config.method || 'GET',
      headers,
      signal: AbortSignal.timeout(API_TIMEOUT)
    };

    // Si necesita body
    if (config.body) {
      requestOptions.body = JSON.stringify(config.body);
    }

    const startTime = Date.now();
    const response = await fetch(config.url, requestOptions);
    const latency = Date.now() - startTime;

    // Usar la función de validación específica del provider
    const isValid = config.validateResponse
      ? config.validateResponse(response)
      : response.status === 200 || response.status === 401;

    if (isValid) {
      // Si es 401, la key es inválida pero el endpoint existe
      if (response.status === 401) {
        return {
          valid: false,
          error: 'API key inválida o expirada (401 Unauthorized)',
          details: { statusCode: response.status, latency }
        };
      }

      // Si es 429, la key existe pero está rate limited
      if (response.status === 429) {
        return {
          valid: true,
          warning: 'API key válida pero temporalmente rate limited (429)',
          details: { statusCode: response.status, latency }
        };
      }

      return {
        valid: true,
        details: { statusCode: response.status, latency }
      };
    }

    // Respuesta inesperada
    let errorText = 'Respuesta inesperada del API';
    try {
      const errorData = await response.text();
      if (errorData) {
        errorText += `: ${errorData.substring(0, 200)}`;
      }
    } catch {}

    return {
      valid: false,
      error: errorText,
      details: { statusCode: response.status, latency }
    };

  } catch (error) {
    // Errores de red
    if (error.name === 'AbortError') {
      return {
        valid: false,
        error: `Timeout después de ${API_TIMEOUT}ms. El API no respondió.`,
        details: { timeout: API_TIMEOUT }
      };
    }

    return {
      valid: false,
      error: `Error de conexión: ${error.message}`,
      details: { errorMessage: error.message }
    };
  }
}

/**
 * Valida una API key para Cloudflare AI Gateway
 * Requiere Account ID, Gateway ID y API Key
 */
async function validateCloudflareGateway(accountId, gatewayId, apiKey) {
  if (!accountId || !gatewayId || !apiKey) {
    return {
      valid: false,
      error: 'Se requieren Account ID, Gateway ID y API Key'
    };
  }

  try {
    const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/gateway/routes/${gatewayId}`;
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      signal: AbortSignal.timeout(API_TIMEOUT)
    });

    if (response.status === 200) {
      return { valid: true };
    }

    if (response.status === 401) {
      return { valid: false, error: 'API key inválida' };
    }

    if (response.status === 404) {
      return { valid: false, error: 'Account ID o Gateway ID no encontrado' };
    }

    const errorText = await response.text();
    return {
      valid: false,
      error: `Error ${response.status}: ${errorText.substring(0, 200)}`
    };

  } catch (error) {
    if (error.name === 'AbortError') {
      return {
        valid: false,
        error: `Timeout después de ${API_TIMEOUT}ms`
      };
    }

    return {
      valid: false,
      error: `Error de conexión: ${error.message}`
    };
  }
}

module.exports = {
  validateProviderKey,
  validateCloudflareGateway,
  PROVIDER_VALIDATION_CONFIG
};
