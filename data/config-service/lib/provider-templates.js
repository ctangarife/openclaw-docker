/**
 * Plantillas de configuración de providers para OpenClaw
 * 
 * PROVIDERS NATIVOS: OpenClaw los detecta automáticamente desde variables de entorno
 * Solo necesitan: {PROVIDER}_API_KEY (ej: OPENAI_API_KEY, ANTHROPIC_API_KEY)
 * NO requieren configuración en models.providers
 * 
 * PROVIDERS PERSONALIZADOS: Requieren configuración explícita en models.providers
 * Necesitan: baseUrl, api, models + variable de entorno
 */

// Providers que OpenClaw detecta automáticamente (no requieren models.providers)
const NATIVE_PROVIDERS = new Set([
  'openai',       // OPENAI_API_KEY
  'anthropic',    // ANTHROPIC_API_KEY
  'google',       // GEMINI_API_KEY o GOOGLE_API_KEY
  'openrouter',   // OPENROUTER_API_KEY
  'groq',         // GROQ_API_KEY
  'xai',          // XAI_API_KEY
  'cerebras',     // CEREBRAS_API_KEY
  'mistral',      // MISTRAL_API_KEY
  'deepseek',     // DEEPSEEK_API_KEY
  'openai-codex', // OAuth
  'opencode',     // OPENCODE_API_KEY
  'vercel-ai-gateway', // AI_GATEWAY_API_KEY
  'zai'           // ZAI_API_KEY
]);

// Mapeo de modelos por defecto para providers nativos
const NATIVE_PROVIDER_MODELS = {
  'openai': 'openai/gpt-4-turbo',
  'anthropic': 'anthropic/claude-3-5-sonnet-20241022',
  'google': 'google/gemini-2.0-flash-exp',
  'openrouter': 'openrouter/anthropic/claude-3.5-sonnet',
  'groq': 'groq/llama-3.3-70b-versatile',
  'xai': 'xai/grok-2-latest',
  'cerebras': 'cerebras/llama-3.3-70b',
  'mistral': 'mistral/mistral-large-latest',
  'deepseek': 'deepseek/deepseek-chat',
  'opencode': 'opencode/claude-opus-4-5',
  'vercel-ai-gateway': 'vercel-ai-gateway/anthropic/claude-3.5-sonnet',
  'zai': 'zai/glm-4-plus'
};

// Lista de modelos disponibles para providers nativos
// OpenClaw los detecta automáticamente, aquí solo listamos los más comunes
const NATIVE_PROVIDER_MODEL_LIST = {
  'openai': [
    { id: 'gpt-4o', name: 'GPT-4o (Omni)' },
    { id: 'gpt-4o-mini', name: 'GPT-4o Mini' },
    { id: 'gpt-4-turbo', name: 'GPT-4 Turbo' },
    { id: 'gpt-4', name: 'GPT-4' },
    { id: 'gpt-3.5-turbo', name: 'GPT-3.5 Turbo' },
    { id: 'o1', name: 'o1 (Reasoning)' },
    { id: 'o1-mini', name: 'o1 Mini' },
    { id: 'o3-mini', name: 'o3 Mini' }
  ],
  'anthropic': [
    { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet (Oct 2024)' },
    { id: 'claude-3-5-sonnet-20240620', name: 'Claude 3.5 Sonnet (Jun 2024)' },
    { id: 'claude-3-opus-20240229', name: 'Claude 3 Opus' },
    { id: 'claude-3-sonnet-20240229', name: 'Claude 3 Sonnet' },
    { id: 'claude-3-haiku-20240307', name: 'Claude 3 Haiku' }
  ],
  'google': [
    { id: 'gemini-2.0-flash-exp', name: 'Gemini 2.0 Flash (Experimental)' },
    { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro' },
    { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash' },
    { id: 'gemini-1.0-pro', name: 'Gemini 1.0 Pro' }
  ],
  'groq': [
    { id: 'llama-3.3-70b-versatile', name: 'Llama 3.3 70B' },
    { id: 'llama-3.1-70b-versatile', name: 'Llama 3.1 70B' },
    { id: 'llama-3.1-8b-instant', name: 'Llama 3.1 8B Instant' },
    { id: 'mixtral-8x7b-32768', name: 'Mixtral 8x7B' }
  ],
  'xai': [
    { id: 'grok-2-latest', name: 'Grok 2 (Latest)' },
    { id: 'grok-2-1212', name: 'Grok 2 (Dec 2024)' },
    { id: 'grok-beta', name: 'Grok Beta' }
  ],
  'mistral': [
    { id: 'mistral-large-latest', name: 'Mistral Large (Latest)' },
    { id: 'mistral-medium-latest', name: 'Mistral Medium (Latest)' },
    { id: 'mistral-small-latest', name: 'Mistral Small (Latest)' }
  ],
  'deepseek': [
    { id: 'deepseek-chat', name: 'DeepSeek Chat' },
    { id: 'deepseek-coder', name: 'DeepSeek Coder' }
  ],
  'cerebras': [
    { id: 'llama-3.3-70b', name: 'Llama 3.3 70B' },
    { id: 'llama-3.1-70b', name: 'Llama 3.1 70B' },
    { id: 'llama-3.1-8b', name: 'Llama 3.1 8B' }
  ],
  'openrouter': [
    { id: 'anthropic/claude-3.5-sonnet', name: 'Claude 3.5 Sonnet' },
    { id: 'openai/gpt-4-turbo', name: 'GPT-4 Turbo' },
    { id: 'google/gemini-pro', name: 'Gemini Pro' },
    { id: 'meta-llama/llama-3.1-70b-instruct', name: 'Llama 3.1 70B' }
  ]
};

// Plantillas SOLO para providers personalizados
const PROVIDER_TEMPLATES = {
  minimax: {
    baseUrl: "https://api.minimax.io/anthropic",
    api: "anthropic-messages",
    models: [
      {
        id: "MiniMax-M2.1",
        name: "MiniMax M2.1",
        reasoning: false,
        input: ["text"],
        cost: {
          input: 15,
          output: 60,
          cacheRead: 2,
          cacheWrite: 10
        },
        contextWindow: 200000,
        maxTokens: 8192
      }
    ]
  },
  moonshot: {
    baseUrl: "https://api.moonshot.cn/v1",
    api: "openai-completions",
    models: [
      {
        id: "moonshot-v1-128k",
        name: "Moonshot v1 128K",
        reasoning: false,
        input: ["text"],
        cost: { input: 0.012, output: 0.012 },
        contextWindow: 128000,
        maxTokens: 8192
      }
    ]
  },
  ollama: {
    baseUrl: "http://localhost:11434/v1",
    api: "openai-completions",
    models: [
      {
        id: "llama3.3",
        name: "Llama 3.3",
        reasoning: false,
        input: ["text"],
        cost: { input: 0, output: 0 },
        contextWindow: 128000,
        maxTokens: 8192
      }
    ]
  }
};

/**
 * Obtiene la plantilla de configuración para un provider
 * @param {string} provider - Nombre del provider
 * @returns {object|null} - Plantilla del provider o null si no existe
 */
function getProviderTemplate(provider) {
  return PROVIDER_TEMPLATES[provider] || null;
}

/**
 * Genera la configuración de providers para models.json basándose en credenciales habilitadas
 * Solo genera configuración para providers PERSONALIZADOS (no nativos)
 * @param {Array<string>} enabledProviders - Lista de providers habilitados
 * @returns {object} - Configuración de providers para models.json
 */
function generateModelsConfig(enabledProviders) {
  const providers = {};
  
  // Solo agregar providers PERSONALIZADOS (no nativos)
  for (const providerName of enabledProviders) {
    if (!NATIVE_PROVIDERS.has(providerName)) {
      const template = getProviderTemplate(providerName);
      if (template) {
        providers[providerName] = {
          baseUrl: template.baseUrl,
          api: template.api,
          models: template.models
        };
      }
    }
  }
  
  return { providers };
}

/**
 * Genera la configuración de providers para openclaw.json basándose en credenciales habilitadas
 * Solo genera configuración para providers PERSONALIZADOS (no nativos)
 * @param {Array<string>} enabledProviders - Lista de providers habilitados
 * @returns {object} - Configuración de providers para openclaw.json
 */
function generateOpenclawProvidersConfig(enabledProviders) {
  const providers = {};
  
  // Solo agregar providers PERSONALIZADOS (no nativos)
  for (const providerName of enabledProviders) {
    if (!NATIVE_PROVIDERS.has(providerName)) {
      const template = getProviderTemplate(providerName);
      if (template) {
        providers[providerName] = {
          baseUrl: template.baseUrl,
          api: template.api,
          models: template.models
          // apiKey se omite - se gestiona desde auth-profiles.json
        };
      }
    }
  }
  
  return providers;
}

/**
 * Verifica si un provider es nativo de OpenClaw
 * @param {string} provider - Nombre del provider
 * @returns {boolean} - true si es nativo, false si es personalizado
 */
function isNativeProvider(provider) {
  return NATIVE_PROVIDERS.has(provider);
}

/**
 * Obtiene el modelo por defecto para un provider
 * @param {string} provider - Nombre del provider
 * @returns {string|null} - Modelo por defecto o null
 */
function getDefaultModel(provider) {
  // Para providers nativos, usar el mapeo predefinido
  if (NATIVE_PROVIDERS.has(provider)) {
    return NATIVE_PROVIDER_MODELS[provider] || null;
  }
  
  // Para providers personalizados, construir desde la plantilla
  const template = getProviderTemplate(provider);
  if (template && template.models && template.models.length > 0) {
    return `${provider}/${template.models[0].id}`;
  }
  
  return null;
}

module.exports = {
  PROVIDER_TEMPLATES,
  NATIVE_PROVIDERS,
  NATIVE_PROVIDER_MODELS,
  NATIVE_PROVIDER_MODEL_LIST,
  getProviderTemplate,
  generateModelsConfig,
  generateOpenclawProvidersConfig,
  isNativeProvider,
  getDefaultModel
};
