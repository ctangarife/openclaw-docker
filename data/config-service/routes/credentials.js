const express = require("express");
const router = express.Router();
const path = require("path");
const mongoose = require("mongoose");
const { encrypt, decrypt } = require("../lib/encrypt");
const { syncAuthProfiles } = require("../lib/sync-openclaw-auth");
const { restartGateway, checkDockerAvailable } = require("../lib/docker-utils");
const { NATIVE_PROVIDERS, NATIVE_PROVIDER_MODEL_LIST, PROVIDER_TEMPLATES, getDefaultModel } = require("../lib/provider-templates");
const { validateProviderKey, validateCloudflareGateway } = require("../lib/validate-provider");
const { sseManager } = require("../lib/notifications");

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
    // Campo para modelo de fallback (ej: "anthropic/claude-3-5-haiku-20241022")
    fallbackModel: { type: String, default: null },
    // Campos adicionales para proveedores específicos (ej: Cloudflare Account ID, Gateway ID)
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true, collection: "api_credentials" }
);
const Credential = mongoose.models.Credential || mongoose.model("Credential", schema);

/**
 * GET /api/credentials/available-providers
 * Retorna la lista de providers disponibles con su información
 * Incluye providers nativos y personalizados desde provider-templates.js
 */
router.get("/available-providers", (req, res) => {
  try {
    const providers = [];

    // Providers nativos (detectados automáticamente por OpenClaw)
    const nativeProviders = [
      {
        value: "anthropic",
        label: "Anthropic API Key",
        group: "Anthropic",
        description: "API key de Anthropic para Claude. Recomendado para uso general.",
        defaultName: "Anthropic API Key",
        tokenLabel: "ANTHROPIC_API_KEY",
        tokenPlaceholder: "sk-ant-...",
        helpUrl: null,
        helpText: null
      },
      {
        value: "anthropic-oauth",
        label: "Anthropic OAuth (Claude Code CLI)",
        group: "Anthropic",
        description: "OAuth de Anthropic (Claude Code CLI). Reutiliza credenciales del sistema.",
        defaultName: "Anthropic OAuth",
        tokenLabel: null,
        tokenPlaceholder: null,
        helpUrl: null,
        helpText: null
      },
      {
        value: "anthropic-token",
        label: "Anthropic Token (setup-token)",
        group: "Anthropic",
        description: "Token de setup de Anthropic. Genera con 'claude setup-token'.",
        defaultName: "Anthropic Setup Token",
        tokenLabel: null,
        tokenPlaceholder: "Pega el token generado",
        helpUrl: null,
        helpText: null
      },
      {
        value: "openai",
        label: "OpenAI API Key",
        group: "OpenAI",
        description: "API key de OpenAI para GPT-4, GPT-3.5, etc.",
        defaultName: "OpenAI API Key",
        tokenLabel: "OPENAI_API_KEY",
        tokenPlaceholder: "sk-...",
        helpUrl: null,
        helpText: null
      },
      {
        value: "openai-codex-cli",
        label: "OpenAI Code Subscription (Codex CLI)",
        group: "OpenAI",
        description: "OpenAI Code Subscription usando Codex CLI. Reutiliza credenciales existentes.",
        defaultName: "OpenAI Codex CLI",
        tokenLabel: null,
        tokenPlaceholder: null,
        helpUrl: null,
        helpText: null
      },
      {
        value: "openai-codex-oauth",
        label: "OpenAI Code Subscription (OAuth)",
        group: "OpenAI",
        description: "OpenAI Code Subscription vía OAuth. Flujo de navegador.",
        defaultName: "OpenAI Codex OAuth",
        tokenLabel: null,
        tokenPlaceholder: null,
        helpUrl: null,
        helpText: null
      },
      {
        value: "zai",
        label: "Z.AI (GLM-4.6)",
        group: "Otros proveedores",
        description: "Z.AI (Zhipu AI) GLM-4.6. Modelo popular en la comunidad.",
        defaultName: "Z.AI GLM-4.6",
        tokenLabel: "ZAI_API_KEY",
        tokenPlaceholder: "Ingresa tu API key de Z.AI",
        helpUrl: "https://docs.z.ai/api-reference/introduction",
        helpText: "Documentación de Z.AI"
      },
      {
        value: "google",
        label: "Google (Gemini)",
        group: "Google",
        description: "Google Gemini 2.0 Flash, 1.5 Pro y más. Requiere GEMINI_API_KEY.",
        defaultName: "Google Gemini",
        tokenLabel: "GEMINI_API_KEY",
        tokenPlaceholder: "Ingresa tu API key de Google",
        helpUrl: "https://ai.google.dev/gemini-api/docs",
        helpText: "Documentación de Google Gemini"
      },
      {
        value: "minimax",
        label: "MiniMax M2.1",
        group: "Otros proveedores",
        description: "MiniMax M2.1. Configuración automática.",
        defaultName: "MiniMax M2.1",
        tokenLabel: null,
        tokenPlaceholder: null,
        helpUrl: "https://docs.openclaw.ai/providers/minimax",
        helpText: null
      },
      {
        value: "moonshot",
        label: "Moonshot AI (Kimi)",
        group: "Otros proveedores",
        description: "Moonshot AI (Kimi K2). Configuración automática.",
        defaultName: "Moonshot AI",
        tokenLabel: null,
        tokenPlaceholder: null,
        helpUrl: "https://docs.openclaw.ai/providers/moonshot",
        helpText: null
      },
      {
        value: "kimi-coding",
        label: "Kimi Coding",
        group: "Otros proveedores",
        description: "Kimi Coding. Configuración automática.",
        defaultName: "Kimi Coding",
        tokenLabel: null,
        tokenPlaceholder: null,
        helpUrl: "https://docs.openclaw.ai/providers/moonshot",
        helpText: null
      },
      {
        value: "synthetic",
        label: "Synthetic (Anthropic-compatible)",
        group: "Otros proveedores",
        description: "Synthetic (compatible con Anthropic).",
        defaultName: "Synthetic API",
        tokenLabel: "SYNTHETIC_API_KEY",
        tokenPlaceholder: null,
        helpUrl: "https://docs.openclaw.ai/providers/synthetic",
        helpText: null
      },
      {
        value: "opencode-zen",
        label: "OpenCode Zen",
        group: "Otros proveedores",
        description: "OpenCode Zen API.",
        defaultName: "OpenCode Zen",
        tokenLabel: "OPENCODE_API_KEY",
        tokenPlaceholder: null,
        helpUrl: "https://opencode.ai/auth",
        helpText: null
      },
      {
        value: "vercel-ai-gateway",
        label: "Vercel AI Gateway",
        group: "Gateways",
        description: "Vercel AI Gateway para enrutar requests a múltiples proveedores.",
        defaultName: "Vercel AI Gateway",
        tokenLabel: "AI_GATEWAY_API_KEY",
        tokenPlaceholder: null,
        helpUrl: "https://docs.openclaw.ai/providers/vercel-ai-gateway",
        helpText: null
      },
      {
        value: "cloudflare-ai-gateway",
        label: "Cloudflare AI Gateway",
        group: "Gateways",
        description: "Cloudflare AI Gateway. Requiere Account ID, Gateway ID y API Key.",
        defaultName: "Cloudflare AI Gateway",
        tokenLabel: null,
        tokenPlaceholder: null,
        helpUrl: "https://docs.openclaw.ai/providers/cloudflare-ai-gateway",
        helpText: null,
        requiresMetadata: true,
        metadataFields: [
          { name: "accountId", label: "Account ID", placeholder: "Cloudflare Account ID" },
          { name: "gatewayId", label: "Gateway ID", placeholder: "Cloudflare Gateway ID" }
        ]
      },
      {
        value: "generic",
        label: "API Key (genérico)",
        group: "Genérico",
        description: "API key genérica para cualquier proveedor no listado.",
        defaultName: "API Key Genérica",
        tokenLabel: null,
        tokenPlaceholder: "Ingresa tu API key",
        helpUrl: null,
        helpText: null
      },
      {
        value: "ollama",
        label: "Ollama (Local)",
        group: "Local",
        description: "Ollama para ejecutar modelos localmente. No requiere API key. Necesita Ollama corriendo en tu máquina.",
        defaultName: "Ollama Local",
        tokenLabel: null,
        tokenPlaceholder: null,
        helpUrl: "https://ollama.com/download",
        helpText: "Descargar Ollama",
        requiresMetadata: true,
        metadataFields: [
          { name: "baseUrl", label: "Ollama URL", placeholder: "http://host.docker.internal:11434/v1" }
        ],
        note: "Ollama debe estar corriendo. Usa 'host.docker.internal' si está en tu máquina o la IP de tu red."
      },
      {
        value: "telegram",
        label: "Telegram Bot",
        group: "Integraciones",
        description: "Conecta OpenClaw a Telegram como bot. Necesita token del bot de @BotFather.",
        defaultName: "Telegram Bot",
        tokenLabel: "Telegram Bot Token",
        tokenPlaceholder: "123456789:ABCdefGhIJKlmNoPQRsTUVwxyZ",
        helpUrl: "https://core.telegram.org/bots/api",
        helpText: "Documentación Telegram Bot API",
        requiresMetadata: true,
        metadataFields: [
          { name: "chatId", label: "Chat ID", placeholder: "123456789 (o -1001234567890 para grupos)" }
        ],
        note: "Crea un bot con @BotFather en Telegram y obtén tu Chat ID enviando /start a tu bot."
      }
    ];

    // Providers personalizados desde templates (dinámicos)
    for (const [providerId, template] of Object.entries(PROVIDER_TEMPLATES)) {
      // Skip si ya está en la lista nativa
      if (nativeProviders.find(p => p.value === providerId)) continue;

      providers.push({
        value: providerId,
        label: providerId.charAt(0).toUpperCase() + providerId.slice(1),
        group: "Otros proveedores",
        description: `${providerId} - Configuración personalizada.`,
        defaultName: providerId.charAt(0).toUpperCase() + providerId.slice(1),
        tokenLabel: null,
        tokenPlaceholder: null,
        helpUrl: null,
        helpText: null
      });
    }

    // Combinar providers nativos y personalizados
    providers.push(...nativeProviders);

    // Ordenar por grupo y luego por label
    providers.sort((a, b) => {
      if (a.group !== b.group) {
        return a.group.localeCompare(b.group);
      }
      return a.label.localeCompare(b.label);
    });

    res.json(providers);
  } catch (e) {
    console.error('[available-providers] Error:', e);
    res.status(500).json({ error: e.message });
  }
});

/**
 * POST /api/credentials/validate
 * Valida una API key antes de guardarla
 * Body: { provider: string, token: string, metadata?: object }
 * Returns: { valid: boolean, error?: string, warning?: string, info?: string, details?: any }
 */
router.post("/validate", async (req, res) => {
  try {
    const { provider, token, metadata } = req.body;

    if (!provider) {
      return res.status(400).json({ error: "provider is required" });
    }

    if (!token) {
      return res.status(400).json({ error: "token is required" });
    }

    console.log(`[POST /validate] Validando API key para provider: ${provider}`);

    // Caso especial para Cloudflare AI Gateway
    if (provider === 'cloudflare-ai-gateway') {
      const { accountId, gatewayId } = metadata || {};
      const result = await validateCloudflareGateway(accountId, gatewayId, token);
      console.log(`[POST /validate] Cloudflare Gateway validation:`, result.valid ? '✅ válido' : '❌ inválido');
      return res.json(result);
    }

    // Validación estándar para otros providers
    const result = await validateProviderKey(provider, token, metadata);
    console.log(`[POST /validate] Provider ${provider}:`, result.valid ? '✅ válido' : '❌ inválido');

    if (result.warning) {
      console.log(`[POST /validate] ⚠️  Warning: ${result.warning}`);
    }

    res.json(result);

  } catch (e) {
    console.error('[POST /validate] Error:', e);
    res.status(500).json({ error: e.message });
  }
});

router.get("/", async (req, res) => {
  try {
    const list = await Credential.find().lean();
    const safe = list.map((c) => ({
      _id: c._id,
      provider: c.provider,
      name: c.name,
      enabled: c.enabled,
      fallbackModel: c.fallbackModel || null,
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
    const { provider, name, token, metadata, fallbackModel } = req.body;
    if (!provider || !token) {
      return res.status(400).json({ error: "provider and token are required" });
    }
    const tokenEncrypted = encrypt(token);
    const doc = await Credential.create({
      provider: provider.trim(),
      name: (name || provider).trim(),
      tokenEncrypted,
      enabled: true,
      fallbackModel: fallbackModel || null,
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
      fallbackModel: doc.fallbackModel || null,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.patch("/:id", async (req, res) => {
  try {
    const { enabled, name, token, metadata, fallbackModel } = req.body;
    const update = {};
    if (typeof enabled === "boolean") update.enabled = enabled;
    if (name !== undefined) update.name = name.trim();
    if (token !== undefined) update.tokenEncrypted = encrypt(token);
    if (metadata !== undefined) update.metadata = metadata;
    if (fallbackModel !== undefined) update.fallbackModel = fallbackModel || null;

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
      fallbackModel: doc.fallbackModel || null,
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

  // Enviar notificación de inicio de sync
  try {
    sseManager.broadcast({
      type: 'sync_started',
      message: 'Iniciando sincronización con OpenClaw...',
      timestamp: new Date().toISOString()
    }, 'sync_started');
  } catch (e) {
    // Notificaciones opcionales
  }

  try {
    // El volumen se monta como ${OPENCLAW_CONFIG_DIR}:/home/node/.openclaw
    // IMPORTANTE: Usar siempre ruta absoluta del contenedor para que coincida con el volumen montado
    const agentDir = process.env.OPENCLAW_AGENT_DIR || '/home/node/.openclaw/agents/main/agent';
    const openclawJsonPath = '/home/node/.openclaw/openclaw.json';
    console.log(`[POST /sync] Llamando syncAuthProfiles con agentDir=${agentDir}, openclawJsonPath=${openclawJsonPath}`);

    // Notificar progreso
    try {
      sseManager.broadcast({
        type: 'sync_progress',
        progress: 25,
        message: 'Sincronizando credenciales...',
        timestamp: new Date().toISOString()
      }, 'sync_progress');
    } catch (e) {}

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

      // Notificar progreso de reinicio
      try {
        sseManager.broadcast({
          type: 'sync_progress',
          progress: 75,
          message: 'Reiniciando gateway...',
          timestamp: new Date().toISOString()
        }, 'sync_progress');

        sseManager.broadcast({
          type: 'gateway_restarting',
          message: 'Reiniciando OpenClaw Gateway...',
          timestamp: new Date().toISOString()
        }, 'gateway_restarting');
      } catch (e) {}

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

      // Notificar completion
      try {
        sseManager.broadcast({
          type: 'sync_completed',
          progress: 100,
          message: `Sincronización exitosa: ${result.profiles.length} credencial(es)`,
          profiles: result.profiles,
          gatewayRestarted: restartSuccess,
          timestamp: new Date().toISOString()
        }, 'sync_completed');

        if (restartSuccess) {
          sseManager.broadcast({
            type: 'gateway_restarted',
            message: 'Gateway reiniciado exitosamente',
            timestamp: new Date().toISOString()
          }, 'gateway_restarted');
        }
      } catch (e) {}

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
      // Notificar error en sync
      try {
        sseManager.broadcast({
          type: 'sync_failed',
          error: result.error,
          timestamp: new Date().toISOString()
        }, 'sync_failed');
      } catch (e) {}

      res.status(500).json({
        success: false,
        error: result.error
      });
    }
  } catch (e) {
    // Notificar error excepcional
    try {
      sseManager.broadcast({
        type: 'sync_failed',
        error: e.message,
        timestamp: new Date().toISOString()
      }, 'sync_failed');
    } catch (err) {}

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
