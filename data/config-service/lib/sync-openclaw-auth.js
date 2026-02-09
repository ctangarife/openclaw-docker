/**
 * Sincroniza credenciales desde MongoDB a OpenClaw's auth-profiles.json
 * y limpia apiKey de openclaw.json para que todo se gestione desde MongoDB
 *
 * El volumen se monta como: ${OPENCLAW_CONFIG_DIR}:/home/node/.openclaw
 * Así que el agente está en: /home/node/.openclaw/agents/main/agent
 */

const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const { decrypt } = require('./encrypt');
const {
  generateModelsConfig,
  generateOpenclawProvidersConfig,
  NATIVE_PROVIDERS,
  getDefaultModel
} = require('./provider-templates');
const { retrySync } = require('./retry');

const schema = new mongoose.Schema(
  {
    provider: String,
    name: String,
    tokenEncrypted: String,
    enabled: { type: Boolean, default: true },
  },
  { timestamps: true, collection: 'api_credentials' }
);

/**
 * Limpia los apiKey de los providers en openclaw.json
 * Las API keys deben estar solo en auth-profiles.json (gestionadas desde MongoDB)
 * @param {string} openclawJsonPath - Ruta al archivo openclaw.json
 * @returns {Promise<{cleaned: boolean, providers: Array}>}
 */
function cleanApiKeysFromOpenclawJson(openclawJsonPath) {
  try {
    if (!fs.existsSync(openclawJsonPath)) {
      return { cleaned: false, providers: [] };
    }

    const config = JSON.parse(fs.readFileSync(openclawJsonPath, 'utf8'));
    const cleanedProviders = [];

    // Limpiar apiKey de models.providers.{provider}.apiKey
    if (config.models?.providers) {
      for (const providerName in config.models.providers) {
        const provider = config.models.providers[providerName];
        if (provider.apiKey) {
          delete provider.apiKey;
          cleanedProviders.push(providerName);
        }
      }
    }

    // Si se limpió algo, escribir el archivo
    if (cleanedProviders.length > 0) {
      fs.writeFileSync(openclawJsonPath, JSON.stringify(config, null, 2), 'utf8');
    }

    return {
      cleaned: cleanedProviders.length > 0,
      providers: cleanedProviders
    };
  } catch (err) {
    console.error('Error limpiando apiKey de openclaw.json:', err.message);
    return {
      cleaned: false,
      providers: [],
      error: err.message
    };
  }
}

/**
 * Sincroniza credenciales habilitadas a auth-profiles.json y limpia openclaw.json
 * @param {string} agentDir - Directorio del agente (ej: /home/node/.openclaw/agents/main/agent)
 * @param {string} openclawJsonPath - Ruta al archivo openclaw.json (opcional)
 * @returns {Promise<{success: boolean, profiles: Array, cleaned: boolean, error?: string}>}
 */
async function syncAuthProfiles(agentDir, openclawJsonPath = null) {
  try {
    const Credential = mongoose.models.Credential || mongoose.model('Credential', schema);
    
    // Obtener solo credenciales habilitadas
    const credentials = await Credential.find({ enabled: true }).lean();
    console.log(`[syncAuthProfiles] Encontradas ${credentials.length} credencial(es) habilitada(s)`);
    
    // Crear directorio si no existe
    if (!fs.existsSync(agentDir)) {
      fs.mkdirSync(agentDir, { recursive: true });
      console.log(`[syncAuthProfiles] Directorio creado: ${agentDir}`);
    }
    
    // Verificar que el directorio es accesible y está en el volumen montado
    try {
      const testFile = path.join(agentDir, '.sync-test');
      fs.writeFileSync(testFile, new Date().toISOString(), 'utf8');
      fs.unlinkSync(testFile);
      console.log(`[syncAuthProfiles] ✅ Verificación: directorio es accesible y escribible: ${agentDir}`);
    } catch (err) {
      console.error(`[syncAuthProfiles] ⚠️  Advertencia: no se pudo escribir archivo de prueba en ${agentDir}:`, err.message);
    }

    const authProfilesFile = path.join(agentDir, 'auth-profiles.json');
    console.log(`[syncAuthProfiles] Escribiendo auth-profiles.json en: ${authProfilesFile}`);

    // Generar auth-profiles.json en formato OpenClaw
    const profiles = credentials
      .map(c => {
        try {
          const apiKey = decrypt(c.tokenEncrypted);
          console.log(`[syncAuthProfiles] ✅ Credencial desencriptada para provider: ${c.provider}`);
          return {
            provider: c.provider,
            apiKey: apiKey
          };
        } catch (err) {
          console.error(`[syncAuthProfiles] ❌ Error desencriptando credencial ${c._id} (${c.provider}):`, err.message);
          return null;
        }
      })
      .filter(p => p !== null);

    const authProfiles = {
      profiles: profiles
    };

    // Escribir auth-profiles.json
    const content = JSON.stringify(authProfiles, null, 2);
    fs.writeFileSync(authProfilesFile, content, 'utf8');
    
    // Forzar sincronización del archivo al disco (importante en Windows/Docker)
    const fd = fs.openSync(authProfilesFile, 'r+');
    fs.fsyncSync(fd);
    fs.closeSync(fd);
    
    console.log(`[syncAuthProfiles] ✅ auth-profiles.json escrito con ${profiles.length} profile(s) en: ${authProfilesFile}`);
    
    // Verificar que el archivo realmente existe después de escribir
    if (!fs.existsSync(authProfilesFile)) {
      throw new Error(`auth-profiles.json no existe después de escribir: ${authProfilesFile}`);
    }
    
    // Verificar que el archivo es accesible desde el host (leerlo de nuevo)
    try {
      const verifyContent = fs.readFileSync(authProfilesFile, 'utf8');
      const verifyJson = JSON.parse(verifyContent);
      console.log(`[syncAuthProfiles] ✅ Verificación de lectura: archivo contiene ${verifyJson.profiles?.length || 0} profile(s)`);
    } catch (err) {
      console.error(`[syncAuthProfiles] ⚠️  Error al verificar lectura del archivo:`, err.message);
    }
    
    // Verificar que el contenido es correcto
    try {
      const writtenContent = JSON.parse(fs.readFileSync(authProfilesFile, 'utf8'));
      if (!writtenContent.profiles || writtenContent.profiles.length !== profiles.length) {
        throw new Error(`El contenido escrito no coincide: esperado ${profiles.length} profiles, encontrado ${writtenContent.profiles?.length || 0}`);
      }
      console.log(`[syncAuthProfiles] ✅ Verificación: archivo contiene ${writtenContent.profiles.length} profile(s) correctamente`);
    } catch (err) {
      console.error(`[syncAuthProfiles] ⚠️  Error verificando contenido escrito:`, err.message);
      throw err;
    }
    
    // Generar models.json desde MongoDB (solo providers PERSONALIZADOS con credenciales habilitadas)
    const modelsFile = path.join(agentDir, 'models.json');
    const enabledProviderNames = profiles.map(p => p.provider);
    const customProviders = enabledProviderNames.filter(p => !NATIVE_PROVIDERS.has(p));

    // Pasar credenciales completas para extraer metadata (baseUrl para Ollama, etc.)
    const credentialsForConfig = credentials.filter(c => c.enabled);
    const modelsConfig = generateModelsConfig(enabledProviderNames, credentialsForConfig);
    const modelsContent = JSON.stringify(modelsConfig, null, 2);
    fs.writeFileSync(modelsFile, modelsContent, 'utf8');
    
    // Forzar sincronización del archivo al disco
    const modelsFd = fs.openSync(modelsFile, 'r+');
    fs.fsyncSync(modelsFd);
    fs.closeSync(modelsFd);
    
    if (customProviders.length > 0) {
      console.log(`✅ models.json generado con providers personalizados: ${customProviders.join(', ')}`);
    } else {
      console.log(`✅ models.json generado (solo providers nativos, no requieren configuración)`);
    }
    
    // Verificar que ambos archivos existen y son accesibles
    const filesToVerify = [authProfilesFile, modelsFile];
    for (const file of filesToVerify) {
      if (fs.existsSync(file)) {
        try {
          const stats = fs.statSync(file);
          console.log(`✅ Archivo verificado: ${file} (${stats.size} bytes, modificado: ${stats.mtime.toISOString()})`);
        } catch (err) {
          console.error(`⚠️  Error verificando ${file}:`, err.message);
        }
      } else {
        console.error(`❌ Archivo NO existe: ${file}`);
      }
    }
    
    // Actualizar openclaw.json: sincronizar providers y limpiar apiKey
    let cleaned = false;
    let providersSynced = [];
    if (openclawJsonPath) {
      try {
        const config = JSON.parse(fs.readFileSync(openclawJsonPath, 'utf8'));

        // Pasar credenciales completas para extraer metadata
        const credentialsForConfig = credentials.filter(c => c.enabled);
        const openclawProviders = generateOpenclawProvidersConfig(enabledProviderNames, credentialsForConfig);
        
        // Sincronizar providers en openclaw.json
        if (!config.models) config.models = {};
        if (!config.models.providers) config.models.providers = {};
        
        // Agregar/actualizar providers desde MongoDB (solo PERSONALIZADOS)
        for (const providerName in openclawProviders) {
          config.models.providers[providerName] = openclawProviders[providerName];
          providersSynced.push(providerName);
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
        const cleanedProviders = [];
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
        
        // Sincronizar modelo por defecto desde MongoDB (app_config.defaultAgentModel)
        const ConfigModel = mongoose.models.Config || mongoose.model('Config', new mongoose.Schema(
          { key: String, value: mongoose.Schema.Types.Mixed },
          { collection: 'app_config' }
        ));
        const defaultModelConfig = await ConfigModel.findOne({ key: 'defaultAgentModel' }).lean();
        const defaultModel = defaultModelConfig?.value;
        
        if (!config.agents) config.agents = {};
        if (!config.agents.defaults) config.agents.defaults = {};
        if (!config.agents.defaults.model) config.agents.defaults.model = {};
        
        const currentModel = config.agents.defaults.model.primary;
        
        // CRÍTICO: Verificar que el modelo por defecto tenga credenciales habilitadas
        if (currentModel) {
          const currentProvider = currentModel.split('/')[0];
          
          // Si el provider del modelo actual no está habilitado, cambiar a uno habilitado
          if (!enabledSet.has(currentProvider)) {
            console.log(`[syncAuthProfiles] ⚠️  Modelo actual usa provider deshabilitado: ${currentProvider}`);
            
            // Prioridad: 1) MongoDB, 2) Primer provider habilitado
            let newModel = defaultModel;
            if (!newModel && enabledProviderNames.length > 0) {
              const firstProvider = enabledProviderNames[0];
              newModel = getDefaultModel(firstProvider);
            }
            
            if (newModel) {
              config.agents.defaults.model.primary = newModel;
              console.log(`[syncAuthProfiles] ✅ Modelo actualizado: ${currentModel} → ${newModel}`);
            } else {
              console.log(`[syncAuthProfiles] ⚠️  No hay providers habilitados, modelo actual se mantendrá pero fallará`);
            }
          }
        } else if (defaultModel) {
          // No hay modelo configurado, usar el de MongoDB
          config.agents.defaults.model.primary = defaultModel;
          console.log(`[syncAuthProfiles] ✅ Modelo sincronizado desde MongoDB: ${defaultModel}`);
        } else if (enabledProviderNames.length > 0) {
          // Fallback: usar primer provider disponible
          const firstProvider = enabledProviderNames[0];
          const fallbackModel = getDefaultModel(firstProvider);
          if (fallbackModel) {
            config.agents.defaults.model.primary = fallbackModel;
            console.log(`[syncAuthProfiles] ✅ Modelo configurado (fallback): ${fallbackModel}`);
          }
        }
        
        // Escribir sin apiKey
        fs.writeFileSync(openclawJsonPath, JSON.stringify(config, null, 2), 'utf8');
        
        // Verificación final: asegurar que NO hay apiKey después de escribir
        const verifyConfig = JSON.parse(fs.readFileSync(openclawJsonPath, 'utf8'));
        const foundApiKeys = [];
        if (verifyConfig.models?.providers) {
          for (const providerName in verifyConfig.models.providers) {
            if (verifyConfig.models.providers[providerName].apiKey) {
              foundApiKeys.push(providerName);
              delete verifyConfig.models.providers[providerName].apiKey;
            }
          }
        }
        if (foundApiKeys.length > 0) {
          console.error(`[syncAuthProfiles] ❌ ERROR: apiKey aún presente después de limpiar: ${foundApiKeys.join(', ')}`);
          fs.writeFileSync(openclawJsonPath, JSON.stringify(verifyConfig, null, 2), 'utf8');
          console.log(`[syncAuthProfiles] ✅ apiKey removido forzadamente de: ${foundApiKeys.join(', ')}`);
        }
        
        cleaned = cleanedProviders.length > 0 || foundApiKeys.length > 0;
        
        if (providersSynced.length > 0) {
          console.log(`✅ Providers sincronizados en openclaw.json: ${providersSynced.join(', ')}`);
        }
        if (removedProviders && removedProviders.length > 0) {
          console.log(`✅ Providers deshabilitados eliminados de openclaw.json: ${removedProviders.join(', ')}`);
        }
        if (cleaned && cleanedProviders.length > 0) {
          console.log(`✅ API keys removidos de openclaw.json para: ${cleanedProviders.join(', ')}`);
        }
      } catch (err) {
        console.error('Error actualizando openclaw.json:', err.message);
      }
    }
    
    return {
      success: true,
      profiles: profiles.map(p => p.provider),
      file: authProfilesFile,
      modelsFile: modelsFile,
      cleaned: cleaned,
      providersSynced: providersSynced
    };
  } catch (err) {
    return {
      success: false,
      profiles: [],
      cleaned: false,
      error: err.message
    };
  }
}

/**
 * Sincroniza credenciales con reintentos automáticos
 * Wrapper sobre syncAuthProfiles que implementa retry con exponential backoff
 *
 * @param {string} agentDir - Directorio del agente
 * @param {string} [openclawJsonPath] - Ruta opcional a openclaw.json
 * @returns {Promise<object>} Resultado de la sincronización
 */
async function syncAuthProfilesWithRetry(agentDir, openclawJsonPath) {
  return retrySync(
    () => syncAuthProfiles(agentDir, openclawJsonPath),
    {
      maxRetries: 3,
      baseDelay: 2000,
      maxDelay: 10000,
      onRetry: (attempt, error) => {
        console.log(`[syncAuthProfilesWithRetry] Reintentando sincronización (intento ${attempt})`);
      }
    }
  );
}

module.exports = {
  syncAuthProfiles,
  syncAuthProfilesWithRetry,  // Nueva función con retry automático
  cleanApiKeysFromOpenclawJson
};
