#!/usr/bin/env node
/**
 * Sincroniza credenciales desde MongoDB a OpenClaw's auth-profiles.json
 * 
 * Lee las credenciales habilitadas (enabled: true) desde MongoDB,
 * las desencripta y genera auth-profiles.json en el formato esperado por OpenClaw.
 * 
 * Uso:
 *   MONGO_URI=... ENCRYPTION_KEY=... AGENT_DIR=... node sync-auth-profiles.cjs
 */

const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const crypto = require('crypto');

// Plantillas de providers (simplificadas para el script standalone)
// Providers NATIVOS: OpenClaw los detecta automáticamente desde variables de entorno
// Solo necesitan: {PROVIDER}_API_KEY
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
  'zai': 'zai/glm-5'
};

// Providers PERSONALIZADOS: Requieren configuración en models.providers
const PROVIDER_TEMPLATES = {
  minimax: {
    baseUrl: "https://api.minimax.io/anthropic",
    api: "anthropic-messages",
    models: [{
      id: "MiniMax-M2.1",
      name: "MiniMax M2.1",
      reasoning: false,
      input: ["text"],
      cost: { input: 15, output: 60, cacheRead: 2, cacheWrite: 10 },
      contextWindow: 200000,
      maxTokens: 8192
    }]
  },
  moonshot: {
    baseUrl: "https://api.moonshot.cn/v1",
    api: "openai-completions",
    models: [{
      id: "moonshot-v1-128k",
      name: "Moonshot v1 128K",
      reasoning: false,
      input: ["text"],
      cost: { input: 0.012, output: 0.012 },
      contextWindow: 128000,
      maxTokens: 8192
    }]
  },
  ollama: {
    baseUrl: "http://localhost:11434/v1",
    api: "openai-completions",
    models: [{
      id: "llama3.3",
      name: "Llama 3.3",
      reasoning: false,
      input: ["text"],
      cost: { input: 0, output: 0 },
      contextWindow: 128000,
      maxTokens: 8192
    }]
  }
};

function generateModelsConfig(enabledProviders) {
  const providers = {};
  // Solo agregar providers PERSONALIZADOS (no nativos)
  for (const providerName of enabledProviders) {
    if (!NATIVE_PROVIDERS.has(providerName)) {
      const template = PROVIDER_TEMPLATES[providerName];
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

function generateOpenclawProvidersConfig(enabledProviders) {
  const providers = {};
  // Solo agregar providers PERSONALIZADOS (no nativos)
  for (const providerName of enabledProviders) {
    if (!NATIVE_PROVIDERS.has(providerName)) {
      const template = PROVIDER_TEMPLATES[providerName];
      if (template) {
        providers[providerName] = {
          baseUrl: template.baseUrl,
          api: template.api,
          models: template.models
        };
      }
    }
  }
  return providers;
}

// Configuración desde variables de entorno
// Siempre usar rutas absolutas del contenedor
const MONGO_URI = process.env.MONGO_URI;
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;
const AGENT_DIR = process.env.AGENT_DIR || '/home/node/.openclaw/agents/main/agent';
const OPENCLAW_CONFIG_DIR = '/home/node/.openclaw'; // Siempre absoluta en el contenedor
const AUTH_PROFILES_FILE = path.join(AGENT_DIR, 'auth-profiles.json');
const OPENCLAW_JSON_FILE = path.join(OPENCLAW_CONFIG_DIR, 'openclaw.json');

if (!MONGO_URI) {
  console.error('MONGO_URI no está definido');
  process.exit(1);
}

if (!ENCRYPTION_KEY || ENCRYPTION_KEY.length < 32) {
  console.error('ENCRYPTION_KEY debe tener al menos 32 caracteres');
  process.exit(1);
}

// Función de desencriptación (mismo algoritmo que encrypt.js)
function getKey(envKey) {
  return crypto.createHash('sha256').update(envKey).digest();
}

function decrypt(cipherText) {
  const ALGO = 'aes-256-gcm';
  const IV_LEN = 16;
  const AUTH_TAG_LEN = 16;
  
  const key = getKey(ENCRYPTION_KEY);
  const buf = Buffer.from(cipherText, 'base64');
  const iv = buf.subarray(0, IV_LEN);
  const authTag = buf.subarray(IV_LEN, IV_LEN + AUTH_TAG_LEN);
  const encrypted = buf.subarray(IV_LEN + AUTH_TAG_LEN);
  const decipher = crypto.createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(authTag);
  return decipher.update(encrypted) + decipher.final('utf8');
}

// Schema de credenciales (debe coincidir con routes/credentials.js)
const credentialSchema = new mongoose.Schema({
  provider: String,
  name: String,
  tokenEncrypted: String,
  enabled: { type: Boolean, default: true },
}, { timestamps: true, collection: 'api_credentials' });

async function syncAuthProfiles() {
  try {
    // Conectar a MongoDB
    await mongoose.connect(MONGO_URI);
    console.log('Conectado a MongoDB');

    const Credential = mongoose.models.Credential || mongoose.model('Credential', credentialSchema);

    // Obtener solo credenciales habilitadas
    const credentials = await Credential.find({ enabled: true }).lean();
    console.log(`Encontradas ${credentials.length} credencial(es) habilitada(s)`);

    // Crear directorio si no existe
    if (!fs.existsSync(AGENT_DIR)) {
      fs.mkdirSync(AGENT_DIR, { recursive: true });
      console.log(`Directorio creado: ${AGENT_DIR}`);
    }

    // Generar auth-profiles.json en formato OpenClaw
    // Formato esperado: { "profiles": [{ "provider": "...", "apiKey": "..." }] }
    const profiles = credentials.map(c => {
      try {
        const apiKey = decrypt(c.tokenEncrypted);
        return {
          provider: c.provider,
          apiKey: apiKey
        };
      } catch (err) {
        console.error(`Error desencriptando credencial ${c._id} (${c.provider}):`, err.message);
        return null;
      }
    }).filter(p => p !== null); // Filtrar errores de desencriptación

    const authProfiles = {
      profiles: profiles
    };

    // Escribir auth-profiles.json
    fs.writeFileSync(AUTH_PROFILES_FILE, JSON.stringify(authProfiles, null, 2), 'utf8');
    // Asegurar que siempre mostramos la ruta absoluta en los logs
    const absolutePath = path.isAbsolute(AUTH_PROFILES_FILE) ? AUTH_PROFILES_FILE : path.resolve(AUTH_PROFILES_FILE);
    console.log(`✅ auth-profiles.json actualizado: ${absolutePath}`);
    console.log(`   Proveedores sincronizados: ${profiles.map(p => p.provider).join(', ')}`);

    // Generar models.json desde MongoDB (solo providers PERSONALIZADOS con credenciales habilitadas)
    const enabledProviderNames = profiles.map(p => p.provider);
    const customProviders = enabledProviderNames.filter(p => !NATIVE_PROVIDERS.has(p));
    const modelsConfig = generateModelsConfig(enabledProviderNames);
    const MODELS_FILE = path.join(AGENT_DIR, 'models.json');
    fs.writeFileSync(MODELS_FILE, JSON.stringify(modelsConfig, null, 2), 'utf8');
    
    if (customProviders.length > 0) {
      console.log(`✅ models.json generado con providers personalizados: ${customProviders.join(', ')}`);
    } else {
      console.log(`✅ models.json generado (solo providers nativos, no requieren configuración)`);
    }

    // Sincronizar y limpiar openclaw.json (las API keys deben estar solo en auth-profiles.json)
    if (fs.existsSync(OPENCLAW_JSON_FILE)) {
      try {
        const config = JSON.parse(fs.readFileSync(OPENCLAW_JSON_FILE, 'utf8'));
        const openclawProviders = generateOpenclawProvidersConfig(enabledProviderNames);
        const cleanedProviders = [];
        const syncedProviders = [];
        
    // Sincronizar providers en openclaw.json
    if (!config.models) config.models = {};
    if (!config.models.providers) config.models.providers = {};
    
        // Agregar/actualizar providers desde MongoDB (solo PERSONALIZADOS)
        for (const providerName in openclawProviders) {
          config.models.providers[providerName] = openclawProviders[providerName];
          syncedProviders.push(providerName);
        }
        
        // CRÍTICO: Eliminar providers deshabilitados (que no están en enabledProviderNames)
        // Solo eliminar providers PERSONALIZADOS (no tocar los nativos que OpenClaw detecta automáticamente)
        const enabledSet = new Set(enabledProviderNames);
        const removedProviders = [];
        for (const providerName in config.models.providers) {
          // Solo eliminar si es personalizado Y no está habilitado
          if (!NATIVE_PROVIDERS.has(providerName) && !enabledSet.has(providerName)) {
            delete config.models.providers[providerName];
            removedProviders.push(providerName);
          }
        }
    
    // CRÍTICO: Limpiar apiKey de TODOS los providers (deben estar solo en auth-profiles.json)
    for (const providerName in config.models.providers) {
      if (config.models.providers[providerName].apiKey) {
        delete config.models.providers[providerName].apiKey;
        cleanedProviders.push(providerName);
      }
    }
        
    // Asegurar que models.mode esté en "merge"
    if (!config.models.mode) {
      config.models.mode = "merge";
    }
    
    // CRÍTICO: Verificar que el modelo por defecto tenga credenciales habilitadas
    const currentDefaultModel = config.agents?.defaults?.model?.primary;
    if (currentDefaultModel) {
      // Extraer el provider del modelo (ej: "minimax/MiniMax-M2.1" -> "minimax")
      const currentProvider = currentDefaultModel.split('/')[0];
      
          // Si el provider del modelo actual no está habilitado, cambiar a uno habilitado
          if (!enabledSet.has(currentProvider)) {
            console.log(`⚠️  Modelo actual usa provider deshabilitado: ${currentProvider}`);
            
            if (enabledProviderNames.length > 0) {
              // Cambiar al primer provider habilitado
              const newProvider = enabledProviderNames[0];
              let newModel = null;
              
              // Para providers nativos, usar el mapeo predefinido
              if (NATIVE_PROVIDERS.has(newProvider)) {
                newModel = NATIVE_PROVIDER_MODELS[newProvider];
              } else {
                // Para providers personalizados, construir el modelo desde la plantilla
                const providerDefaultModels = {
                  'minimax': 'minimax/MiniMax-M2.1',
                  'moonshot': 'moonshot/moonshot-v1-128k',
                  'ollama': 'ollama/llama3.3'
                };
                newModel = providerDefaultModels[newProvider] || `${newProvider}/default`;
              }
              
              if (!config.agents) config.agents = {};
              if (!config.agents.defaults) config.agents.defaults = {};
              if (!config.agents.defaults.model) config.agents.defaults.model = {};
              config.agents.defaults.model.primary = newModel;
              
              console.log(`✅ Modelo actualizado: ${currentDefaultModel} → ${newModel}`);
            } else {
              console.log(`⚠️  No hay providers habilitados, modelo actual se mantendrá pero fallará`);
            }
          }
        }
    
    // Escribir sin apiKey
    fs.writeFileSync(OPENCLAW_JSON_FILE, JSON.stringify(config, null, 2), 'utf8');
        
        // Verificación final: asegurar que NO hay apiKey después de escribir
        const verifyConfig = JSON.parse(fs.readFileSync(OPENCLAW_JSON_FILE, 'utf8'));
        let foundApiKeys = [];
        if (verifyConfig.models?.providers) {
          for (const providerName in verifyConfig.models.providers) {
            if (verifyConfig.models.providers[providerName].apiKey) {
              foundApiKeys.push(providerName);
            }
          }
        }
        if (foundApiKeys.length > 0) {
          console.error(`❌ ERROR: apiKey aún presente después de limpiar: ${foundApiKeys.join(', ')}`);
          // Forzar limpieza nuevamente
          for (const providerName of foundApiKeys) {
            delete verifyConfig.models.providers[providerName].apiKey;
          }
          fs.writeFileSync(OPENCLAW_JSON_FILE, JSON.stringify(verifyConfig, null, 2), 'utf8');
          console.log(`✅ apiKey removido forzadamente de: ${foundApiKeys.join(', ')}`);
        }
        
        if (syncedProviders.length > 0) {
          console.log(`✅ Providers sincronizados en openclaw.json: ${syncedProviders.join(', ')}`);
        }
        if (removedProviders.length > 0) {
          console.log(`✅ Providers deshabilitados eliminados de openclaw.json: ${removedProviders.join(', ')}`);
        }
        if (cleanedProviders.length > 0) {
          console.log(`✅ API keys removidos de openclaw.json para: ${cleanedProviders.join(', ')}`);
        }
        console.log(`   Toda la configuración ahora se gestiona desde MongoDB`);
      } catch (err) {
        console.error(`⚠️  Error actualizando openclaw.json:`, err.message);
      }
    }

    await mongoose.disconnect();
    process.exit(0);
  } catch (err) {
    console.error('Error sincronizando auth-profiles:', err.message);
    process.exit(1);
  }
}

syncAuthProfiles();
