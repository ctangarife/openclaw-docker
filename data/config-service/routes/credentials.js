const express = require("express");
const router = express.Router();
const path = require("path");
const mongoose = require("mongoose");
const { encrypt, decrypt } = require("../lib/encrypt");
const { syncAuthProfiles } = require("../lib/sync-openclaw-auth");
const { restartGateway, checkDockerAvailable } = require("../lib/docker-utils");

// Función para invalidar caché de modelos (importada dinámicamente para evitar dependencia circular)
function clearModelsCache() {
  try {
    // Acceder al caché desde el módulo config.js
    const configModule = require.cache[require.resolve('./config')];
    if (configModule && configModule.exports.clearModelsCache) {
      configModule.exports.clearModelsCache();
      console.log('[credentials] 🗑️  Caché de modelos invalidado');
    }
  } catch (err) {
    console.error('[credentials] ⚠️  Error invalidando caché de modelos:', err.message);
  }
}

const schema = new mongoose.Schema(
  {
    provider: String,
    name: String,
    tokenEncrypted: String,
    enabled: { type: Boolean, default: true },
    // Campos adicionales para proveedores específicos (ej: Cloudflare Account ID, Gateway ID)
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true, collection: "api_credentials" }
);
const Credential = mongoose.models.Credential || mongoose.model("Credential", schema);

router.get("/", async (req, res) => {
  try {
    const list = await Credential.find().lean();
    const safe = list.map((c) => ({
      _id: c._id,
      provider: c.provider,
      name: c.name,
      enabled: c.enabled,
      metadata: c.metadata || {},
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
    }));
    res.json(safe);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post("/", async (req, res) => {
  try {
    const { provider, name, token, metadata } = req.body;
    if (!provider || !token) {
      return res.status(400).json({ error: "provider and token are required" });
    }
    const tokenEncrypted = encrypt(token);
    const doc = await Credential.create({
      provider: provider.trim(),
      name: (name || provider).trim(),
      tokenEncrypted,
      enabled: true,
      metadata: metadata || {},
    });
    
    // Sincronizar automáticamente con OpenClaw y limpiar apiKey de openclaw.json
    // El volumen se monta como ${OPENCLAW_CONFIG_DIR}:/home/node/.openclaw
    // IMPORTANTE: Usar siempre ruta absoluta del contenedor para que coincida con el volumen montado
    const agentDir = process.env.OPENCLAW_AGENT_DIR || '/home/node/.openclaw/agents/main/agent';
    const openclawJsonPath = '/home/node/.openclaw/openclaw.json';
    // Ejecutar sincronización de forma asíncrona (no bloquear la respuesta)
    console.log(`[POST /credentials] Iniciando sincronización automática...`);
    
    // Invalidar caché de modelos cuando se agrega una credencial
    clearModelsCache();
    
    syncAuthProfiles(agentDir, openclawJsonPath)
      .then(async (result) => {
        console.log(`[POST /credentials] Sincronización completada, resultado:`, result.success ? 'success' : 'failed');
        if (result.success) {
          console.log(`✅ Sincronización automática: ${result.profiles.length} credencial(es) → auth-profiles.json, models.json`);
          if (result.providersSynced && result.providersSynced.length > 0) {
            console.log(`   Providers sincronizados en openclaw.json: ${result.providersSynced.join(', ')}`);
          }
          
          // Reiniciar openclaw-gateway automáticamente
          const restartResult = await restartGateway();
          if (!restartResult.success) {
            console.error(`⚠️  Error al reiniciar contenedor: ${restartResult.error}`);
          }
        } else {
          console.error('❌ Error en sincronización automática:', result.error);
        }
      })
      .catch(err => {
        console.error('❌ Error sincronizando credenciales después de crear:', err.message);
        console.error('   Stack:', err.stack);
      });
    
    res.status(201).json({
      _id: doc._id,
      provider: doc.provider,
      name: doc.name,
      enabled: doc.enabled,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.patch("/:id", async (req, res) => {
  try {
    const { enabled, name, token, metadata } = req.body;
    const update = {};
    if (typeof enabled === "boolean") update.enabled = enabled;
    if (name !== undefined) update.name = name.trim();
    if (token !== undefined) update.tokenEncrypted = encrypt(token);
    if (metadata !== undefined) update.metadata = metadata;

    const doc = await Credential.findByIdAndUpdate(
      req.params.id,
      { $set: update },
      { new: true }
    ).lean();
    if (!doc) return res.status(404).json({ error: "Not found" });
    
    // Sincronizar automáticamente con OpenClaw y limpiar apiKey de openclaw.json
    const agentDir = process.env.OPENCLAW_AGENT_DIR || '/home/node/.openclaw/agents/main/agent';
    // Siempre usar ruta absoluta del contenedor (el volumen está montado en /home/node/.openclaw)
    const openclawJsonPath = '/home/node/.openclaw/openclaw.json';
    
    // Invalidar caché de modelos cuando se actualiza una credencial
    clearModelsCache();
    
    syncAuthProfiles(agentDir, openclawJsonPath)
      .then(async (result) => {
        if (result.success) {
          console.log(`✅ Sincronización automática (update): ${result.profiles.length} credencial(es)`);
          
          // Reiniciar openclaw-gateway automáticamente
          const restartResult = await restartGateway();
          if (!restartResult.success) {
            console.error(`⚠️  Error al reiniciar contenedor: ${restartResult.error}`);
          }
        } else {
          console.error('❌ Error en sincronización automática:', result.error);
        }
      })
      .catch(err => {
        console.error('❌ Error sincronizando credenciales después de actualizar:', err.message);
      });
    
    res.json({
      _id: doc._id,
      provider: doc.provider,
      name: doc.name,
      enabled: doc.enabled,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    const doc = await Credential.findByIdAndDelete(req.params.id);
    if (!doc) return res.status(404).json({ error: "Not found" });
    
    // Sincronizar automáticamente con OpenClaw y limpiar apiKey de openclaw.json
    const agentDir = process.env.OPENCLAW_AGENT_DIR || '/home/node/.openclaw/agents/main/agent';
    // Siempre usar ruta absoluta del contenedor (el volumen está montado en /home/node/.openclaw)
    const openclawJsonPath = '/home/node/.openclaw/openclaw.json';
    
    // Invalidar caché de modelos cuando se elimina una credencial
    clearModelsCache();
    
    syncAuthProfiles(agentDir, openclawJsonPath)
      .then(async (result) => {
        if (result.success) {
          console.log(`✅ Sincronización automática (delete): ${result.profiles.length} credencial(es) restantes`);
          
          // Reiniciar openclaw-gateway automáticamente
          const restartResult = await restartGateway();
          if (!restartResult.success) {
            console.error(`⚠️  Error al reiniciar contenedor: ${restartResult.error}`);
          }
        } else {
          console.error('❌ Error en sincronización automática:', result.error);
        }
      })
      .catch(err => {
        console.error('❌ Error sincronizando credenciales después de eliminar:', err.message);
      });
    
    res.status(204).send();
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Endpoint para sincronización manual
// Acepta POST con body vacío o GET
router.post("/sync", async (req, res) => {
  // Forzar escritura inmediata de logs - múltiples métodos para asegurar que se vea
  const timestamp = new Date().toISOString();
  const logMsg = `[${timestamp}] [POST /sync] Endpoint de sincronización manual llamado\n`;
  // Escribir inmediatamente sin buffering
  process.stdout.write(logMsg);
  process.stderr.write(logMsg);
  console.log(`[${timestamp}] [POST /sync] Endpoint de sincronización manual llamado`);
  console.error(`[STDERR] [${timestamp}] [POST /sync] Endpoint de sincronización manual llamado`);
  // Forzar flush
  if (process.stdout.flush) process.stdout.flush();
  if (process.stderr.flush) process.stderr.flush();
  try {
    // El volumen se monta como ${OPENCLAW_CONFIG_DIR}:/home/node/.openclaw
    // IMPORTANTE: Usar siempre ruta absoluta del contenedor para que coincida con el volumen montado
    const agentDir = process.env.OPENCLAW_AGENT_DIR || '/home/node/.openclaw/agents/main/agent';
    const openclawJsonPath = '/home/node/.openclaw/openclaw.json';
    console.log(`[POST /sync] Llamando syncAuthProfiles con agentDir=${agentDir}, openclawJsonPath=${openclawJsonPath}`);
    const result = await syncAuthProfiles(agentDir, openclawJsonPath);
    console.log(`[POST /sync] syncAuthProfiles completado, success=${result.success}`);
    
    if (result.success) {
      // Verificar que el archivo realmente existe después de escribir
      const authProfilesFile = path.join(agentDir, 'auth-profiles.json');
      const fileExists = require('fs').existsSync(authProfilesFile);
      
      if (!fileExists) {
        console.error(`⚠️  auth-profiles.json no existe después de sincronización: ${authProfilesFile}`);
        process.stdout.write(`[POST /sync] ERROR: Archivo no existe en: ${authProfilesFile}\n`);
      } else {
        // Forzar lectura del archivo para verificar que está sincronizado
        try {
          const verifyContent = require('fs').readFileSync(authProfilesFile, 'utf8');
          const verifyJson = JSON.parse(verifyContent);
          console.log(`[POST /sync] ✅ Archivo verificado: ${verifyJson.profiles?.length || 0} profile(s)`);
          process.stdout.write(`[POST /sync] Archivo verificado con ${verifyJson.profiles?.length || 0} profile(s)\n`);
        } catch (err) {
          console.error(`[POST /sync] Error verificando archivo:`, err.message);
          process.stderr.write(`[POST /sync] Error verificando archivo: ${err.message}\n`);
        }
        // Leer el archivo para verificar su contenido
        try {
          const content = JSON.parse(require('fs').readFileSync(authProfilesFile, 'utf8'));
          console.log(`✅ auth-profiles.json verificado: ${content.profiles.length} profile(s)`);
        } catch (err) {
          console.error(`⚠️  Error leyendo auth-profiles.json después de escribir:`, err.message);
        }
      }
      
      // Reiniciar openclaw-gateway automáticamente para que lea el archivo actualizado
      console.log(`[POST /sync] Intentando reiniciar contenedor...`);
      
      // Verificar que docker está disponible
      const dockerCheck = await checkDockerAvailable();
      if (!dockerCheck.available) {
        console.error(`[POST /sync] ❌ Docker NO disponible: ${dockerCheck.error}`);
      } else {
        console.log(`[POST /sync] Docker disponible: ${dockerCheck.version}`);
      }
      
      const restartResult = await restartGateway();
      const restartSuccess = restartResult.success;
      const restartError = restartResult.error;
      
      // Forzar flush de logs antes de responder
      process.stdout.write(`[POST /sync] Respondiendo con éxito. restartSuccess=${restartSuccess}\n`);
      
      res.json({
        success: true,
        message: `Sincronizadas ${result.profiles.length} credencial(es)`,
        profiles: result.profiles,
        file: result.file,
        modelsFile: result.modelsFile,
        cleaned: result.cleaned || false,
        providersSynced: result.providersSynced || [],
        fileExists: fileExists,
        gatewayRestarted: restartSuccess,
        restartError: restartError || undefined,
        note: restartSuccess 
          ? `✅ Archivo sincronizado y contenedor reiniciado. OpenClaw debería leer las nuevas credenciales.`
          : fileExists 
            ? `⚠️  Archivo creado pero no se pudo reiniciar el contenedor. Reinicia manualmente o usa POST /api/gateway/restart`
            : "⚠️  El archivo no se creó correctamente. Revisa los logs del config-service."
      });
    } else {
      res.status(500).json({
        success: false,
        error: result.error
      });
    }
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// También aceptar GET para facilitar pruebas
router.get("/sync", async (req, res) => {
  try {
    const agentDir = process.env.OPENCLAW_AGENT_DIR || '/home/node/.openclaw/agents/main/agent';
    // Siempre usar ruta absoluta del contenedor (el volumen está montado en /home/node/.openclaw)
    const openclawJsonPath = '/home/node/.openclaw/openclaw.json';
    const result = await syncAuthProfiles(agentDir, openclawJsonPath);
    
    if (result.success) {
      res.json({
        success: true,
        message: `Sincronizadas ${result.profiles.length} credencial(es)`,
        profiles: result.profiles,
        file: result.file,
        modelsFile: result.modelsFile,
        cleaned: result.cleaned || false,
        providersSynced: result.providersSynced || []
      });
    } else {
      res.status(500).json({
        success: false,
        error: result.error
      });
    }
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
