const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");
const { invalidateFallbackCache } = require("../lib/openclaw-client");

const schema = new mongoose.Schema(
  { key: String, value: mongoose.Schema.Types.Mixed },
  { timestamps: true, collection: "app_config" }
);
schema.index({ key: 1 }, { unique: true });
const Config = mongoose.models.Config || mongoose.model("Config", schema);

// ============================================================
// CACHÉ EN MEMORIA para modelos de OpenClaw
// ============================================================
const modelsCache = {
  data: null,
  timestamp: 0,
  TTL: 5 * 60 * 1000, // 5 minutos
  
  isValid() {
    return this.data && (Date.now() - this.timestamp < this.TTL);
  },
  
  set(data) {
    this.data = data;
    this.timestamp = Date.now();
  },
  
  clear() {
    this.data = null;
    this.timestamp = 0;
  }
};

/**
 * Obtiene modelos disponibles desde OpenClaw Gateway
 * @returns {Promise<Object>} Modelos agrupados por provider
 */
async function fetchModelsFromOpenClaw() {
  try {
    const openclawUrl = process.env.OPENCLAW_GATEWAY_URL || 'http://openclaw-gateway:18789';
    const response = await fetch(`${openclawUrl}/v1/models`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${process.env.OPENCLAW_GATEWAY_TOKEN}`,
        'Content-Type': 'application/json'
      },
      signal: AbortSignal.timeout(5000) // Timeout de 5 segundos
    });
    
    if (!response.ok) {
      throw new Error(`OpenClaw responded with ${response.status}`);
    }
    
    const data = await response.json();
    
    // Filtrar solo modelos disponibles y agrupar por provider
    const availableModels = data.models.filter(m => m.available === true);
    const grouped = {};
    
    for (const model of availableModels) {
      // Extraer provider del key (formato: "provider/model-name")
      const parts = model.key.split('/');
      if (parts.length !== 2) continue;
      
      const provider = parts[0];
      const modelId = parts[1];
      
      if (!grouped[provider]) {
        grouped[provider] = [];
      }
      
      grouped[provider].push({
        id: model.key, // Mantener formato completo "provider/model"
        name: model.name
      });
    }
    
    console.log(`[fetchModelsFromOpenClaw] ✅ Obtenidos ${availableModels.length} modelos de ${Object.keys(grouped).length} providers`);
    return grouped;
    
  } catch (error) {
    console.error('[fetchModelsFromOpenClaw] ❌ Error:', error.message);
    return null;
  }
}

router.get("/", async (req, res) => {
  try {
    const docs = await Config.find().lean();
    const map = {};
    docs.forEach((d) => (map[d.key] = d.value));
    res.json(map);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * GET /api/config/available-models
 * Retorna modelos disponibles, filtrando por credenciales habilitadas
 */
router.get("/available-models", async (req, res) => {
  try {
    console.log('[available-models] 📞 Endpoint llamado');
    
    // 1. Verificar caché
    if (modelsCache.isValid()) {
      console.log('[available-models] ⚡ Retornando desde caché');
      return res.json(modelsCache.data);
    }
    
    console.log('[available-models] 🔄 Caché expirado, consultando OpenClaw...');
    
    // 2. Obtener modelos desde OpenClaw
    const allModels = await fetchModelsFromOpenClaw();
    
    // 3. Obtener credenciales habilitadas (necesario tanto para OpenClaw como para fallback)
    const Credential = mongoose.models.Credential || mongoose.model('Credential', 
      new mongoose.Schema({
        provider: String,
        enabled: { type: Boolean, default: true }
      }, { collection: 'api_credentials' })
    );
    
    const credentials = await Credential.find({ enabled: true }).lean();
    const enabledProviders = new Set(credentials.map(c => c.provider));
    
    console.log(`[available-models] 🔑 Providers habilitados: ${Array.from(enabledProviders).join(', ')}`);
    
    if (!allModels) {
      console.log('[available-models] ⚠️  OpenClaw no disponible, usando fallback');
      // Fallback: usar provider-templates.js PERO filtrar por credenciales
      const { NATIVE_PROVIDER_MODEL_LIST, PROVIDER_TEMPLATES } = require("../lib/provider-templates");
      
      const fallbackModels = {};
      
      // Agregar modelos nativos (solo providers habilitados)
      for (const [provider, models] of Object.entries(NATIVE_PROVIDER_MODEL_LIST)) {
        if (enabledProviders.has(provider)) {
          fallbackModels[provider] = models.map(m => ({
            id: `${provider}/${m.id}`,
            name: m.name
          }));
        }
      }
      
      // Agregar modelos personalizados (solo providers habilitados)
      for (const [provider, config] of Object.entries(PROVIDER_TEMPLATES)) {
        if (enabledProviders.has(provider)) {
          fallbackModels[provider] = config.models.map(m => ({
            id: `${provider}/${m.id}`,
            name: m.name
          }));
        }
      }
      
      console.log(`[available-models] ✅ Fallback: ${Object.keys(fallbackModels).length} providers habilitados`);
      modelsCache.set(fallbackModels);
      return res.json(fallbackModels);
    }
    
    
    // 4. Filtrar solo providers habilitados
    const filteredModels = {};
    for (const [provider, models] of Object.entries(allModels)) {
      if (enabledProviders.has(provider)) {
        filteredModels[provider] = models;
      }
    }
    
    console.log(`[available-models] ✅ Retornando ${Object.keys(filteredModels).length} providers habilitados`);
    
    // 5. Guardar en caché y retornar
    modelsCache.set(filteredModels);
    res.json(filteredModels);
    
  } catch (e) {
    console.error('[available-models] ❌ ERROR:', e);
    res.status(500).json({ error: e.message });
  }
});

router.put("/", async (req, res) => {
  try {
    const body = req.body;
    if (typeof body !== "object" || body === null) {
      return res.status(400).json({ error: "JSON object required" });
    }
    for (const [key, value] of Object.entries(body)) {
      await Config.findOneAndUpdate(
        { key },
        { $set: { value, updatedAt: new Date() } },
        { upsert: true, new: true }
      );
    }
    
    // Si se actualizó defaultAgentModel, sincronizar con OpenClaw y reiniciar gateway
    if (body.defaultAgentModel !== undefined) {
      const { syncAuthProfiles } = require("../lib/sync-openclaw-auth");
      const { restartGateway } = require("../lib/docker-utils");
      const agentDir = process.env.OPENCLAW_AGENT_DIR || "/home/node/.openclaw/agents/main/agent";
      const openclawJsonPath = "/home/node/.openclaw/openclaw.json";

      try {
        await syncAuthProfiles(agentDir, openclawJsonPath);
        console.log(`[PUT /config] Modelo por defecto actualizado a: ${body.defaultAgentModel}`);

        // Reiniciar gateway para aplicar el nuevo modelo
        const restartResult = await restartGateway();
        if (restartResult.success) {
          console.log(`[PUT /config] Gateway reiniciado exitosamente`);
        } else {
          console.error(`[PUT /config] Error reiniciando gateway: ${restartResult.error}`);
        }
      } catch (syncErr) {
        console.error(`[PUT /config] Error sincronizando después de actualizar modelo:`, syncErr.message);
        // No fallar la request, solo loguear el error
      }
    }

    // Si se actualizaron los modelos de fallback, invalidar el caché
    if (body.fallbackModel1 !== undefined || body.fallbackModel2 !== undefined) {
      invalidateFallbackCache();
      console.log(`[PUT /config] Caché de fallback invalidado por cambio en modelos de soporte`);
    }
    
    // Si se actualizaron credenciales, invalidar caché de modelos
    if (body.credentials !== undefined) {
      console.log('[PUT /config] 🗑️  Invalidando caché de modelos por cambio en credenciales');
      modelsCache.clear();
    }
    
    const docs = await Config.find().lean();
    const map = {};
    docs.forEach((d) => (map[d.key] = d.value));
    res.json(map);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;

// Exportar función para invalidar caché (usado por credentials.js)
module.exports.clearModelsCache = () => {
  modelsCache.clear();
};
