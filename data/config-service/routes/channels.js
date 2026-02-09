/**
 * Rutas para gestión de Canales/Workflows
 * Los canales se guardan en MongoDB y se sincronizan con OpenClaw
 */
const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");
const path = require("path");
const { restartGateway } = require("../lib/docker-utils");
const { sseManager } = require("../lib/notifications");

// Función para invalidar caché de modelos
function clearModelsCache() {
  try {
    const configModule = require.cache[require.resolve('./config')];
    if (configModule && configModule.exports.clearModelsCache) {
      configModule.exports.clearModelsCache();
      console.log('[channels] 🗑️  Caché de modelos invalidado');
    }
  } catch (err) {
    console.error('[channels] ⚠️  Error invalidando caché de modelos:', err.message);
  }
}

// Schema para canales/workflows
const channelSchema = new mongoose.Schema(
  {
    id: {
      type: String,
      required: true,
      unique: true
    },
    name: {
      type: String,
      required: true
    },
    description: {
      type: String,
      default: ""
    },
    // Configuración del canal en formato OpenClaw
    config: {
      type: mongoose.Schema.Types.Mixed,
      required: true
    },
    // El canal está habilitado
    enabled: {
      type: Boolean,
      default: true
    },
    // Orden de visualización
    order: {
      type: Number,
      default: 0
    },
    // Metadata adicional
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    }
  },
  { timestamps: true, collection: "channels" }
);

const Channel = mongoose.models.Channel || mongoose.model("Channel", channelSchema);

/**
 * GET /api/channels
 * Lista todos los canales
 */
router.get("/", async (req, res) => {
  try {
    const list = await Channel.find().sort({ order: 1, name: 1 }).lean();
    res.json(list);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * GET /api/channels/default
 * Obtiene los canales predefinidos de OpenClaw para usar como templates
 */
router.get("/default", async (req, res) => {
  try {
    const agentDir = process.env.OPENCLAW_AGENT_DIR || '/home/node/.openclaw/agents/main/agent';
    const channelsFile = path.join(agentDir, 'channels.json');

    const fs = require('fs');
    if (fs.existsSync(channelsFile)) {
      const content = fs.readFileSync(channelsFile, 'utf8');
      const channels = JSON.parse(content);
      res.json(channels);
    } else {
      // Si no existe, retornar canales predefinidos por defecto
      res.json({
        channels: [
          {
            id: "default",
            name: "Default",
            description: "Default channel",
            config: {
              model: "${defaultModel}",
              systemPrompt: "${defaultSystemPrompt || 'You are a helpful assistant.'}"
            }
          },
          {
            id: "code",
            name: "Code",
            description: "For coding tasks",
            config: {
              model: "anthropic/claude-3-5-sonnet-20241022",
              systemPrompt: "You are an expert programmer. Help with coding tasks, debugging, and code review."
            }
          },
          {
            id: "chat",
            name: "Chat",
            description: "General chat",
            config: {
              model: "anthropic/claude-3-5-haiku-20241022",
              systemPrompt: "You are a helpful assistant."
            }
          }
        ]
      });
    }
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * POST /api/channels
 * Crea un nuevo canal
 */
router.post("/", async (req, res) => {
  try {
    const { id, name, description, config, enabled, order, metadata } = req.body;

    if (!id || !name || !config) {
      return res.status(400).json({ error: "id, name and config are required" });
    }

    // Verificar que el ID no exista
    const existing = await Channel.findOne({ id });
    if (existing) {
      return res.status(409).json({ error: "Channel with this ID already exists" });
    }

    const doc = await Channel.create({
      id,
      name,
      description: description || "",
      config,
      enabled: enabled !== undefined ? enabled : true,
      order: order || 0,
      metadata: metadata || {}
    });

    // Sincronizar con OpenClaw
    await syncChannelsToOpenClaw();

    // Invalidar caché
    clearModelsCache();

    // Notificar
    try {
      sseManager.broadcast({
        type: 'channel_created',
        channel: { id, name },
        timestamp: new Date().toISOString()
      }, 'channel_created');
    } catch (e) {}

    res.status(201).json(doc);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * PATCH /api/channels/:id
 * Actualiza un canal
 */
router.patch("/:id", async (req, res) => {
  try {
    const { name, description, config, enabled, order, metadata } = req.body;
    const update = {};
    if (name !== undefined) update.name = name;
    if (description !== undefined) update.description = description;
    if (config !== undefined) update.config = config;
    if (enabled !== undefined) update.enabled = enabled;
    if (order !== undefined) update.order = order;
    if (metadata !== undefined) update.metadata = metadata;

    const doc = await Channel.findOneAndUpdate(
      { id: req.params.id },
      { $set: update },
      { new: true, runValidators: true }
    ).lean();

    if (!doc) return res.status(404).json({ error: "Channel not found" });

    // Sincronizar con OpenClaw
    await syncChannelsToOpenClaw();

    // Invalidar caché
    clearModelsCache();

    // Notificar
    try {
      sseManager.broadcast({
        type: 'channel_updated',
        channel: { id: req.params.id, name: doc.name },
        timestamp: new Date().toISOString()
      }, 'channel_updated');
    } catch (e) {}

    res.json(doc);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * DELETE /api/channels/:id
 * Elimina un canal
 */
router.delete("/:id", async (req, res) => {
  try {
    const doc = await Channel.findOneAndDelete({ id: req.params.id });
    if (!doc) return res.status(404).json({ error: "Channel not found" });

    // Sincronizar con OpenClaw
    await syncChannelsToOpenClaw();

    // Invalidar caché
    clearModelsCache();

    // Notificar
    try {
      sseManager.broadcast({
        type: 'channel_deleted',
        channel: { id: req.params.id, name: doc.name },
        timestamp: new Date().toISOString()
      }, 'channel_deleted');
    } catch (e) {}

    res.status(204).send();
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * POST /api/channels/sync
 * Sincroniza manualmente los canales con OpenClaw
 */
router.post("/sync", async (req, res) => {
  try {
    // Notificar inicio
    try {
      sseManager.broadcast({
        type: 'channels_sync_started',
        message: 'Sincronizando canales...',
        timestamp: new Date().toISOString()
      }, 'channels_sync_started');
    } catch (e) {}

    const result = await syncChannelsToOpenClaw();

    // Reiniciar gateway
    const restartResult = await restartGateway();

    // Notificar completion
    try {
      sseManager.broadcast({
        type: 'channels_sync_completed',
        message: `Canales sincronizados: ${result.channelsCount}`,
        gatewayRestarted: restartResult.success,
        timestamp: new Date().toISOString()
      }, 'channels_sync_completed');
    } catch (e) {}

    res.json({
      success: true,
      ...result,
      gatewayRestarted: restartResult.success,
      restartError: restartResult.error
    });
  } catch (e) {
    // Notificar error
    try {
      sseManager.broadcast({
        type: 'channels_sync_failed',
        error: e.message,
        timestamp: new Date().toISOString()
      }, 'channels_sync_failed');
    } catch (err) {}

    res.status(500).json({ error: e.message });
  }
});

/**
 * POST /api/channels/import-default
 * Importa los canales por defecto de OpenClaw a MongoDB
 */
router.post("/import-default", async (req, res) => {
  try {
    const agentDir = process.env.OPENCLAW_AGENT_DIR || '/home/node/.openclaw/agents/main/agent';
    const channelsFile = path.join(agentDir, 'channels.json');

    const fs = require('fs');
    if (!fs.existsSync(channelsFile)) {
      return res.status(404).json({ error: "channels.json not found" });
    }

    const content = fs.readFileSync(channelsFile, 'utf8');
    const data = JSON.parse(content);

    let imported = 0;
    let updated = 0;

    // Importar cada canal
    for (const channel of (data.channels || [])) {
      const existing = await Channel.findOne({ id: channel.id });

      if (existing) {
        await Channel.findOneAndUpdate(
          { id: channel.id },
          { $set: { config: channel.config, name: channel.name } }
        );
        updated++;
      } else {
        await Channel.create({
          id: channel.id,
          name: channel.name || channel.id,
          description: channel.description || "",
          config: channel.config,
          enabled: true,
          order: 0
        });
        imported++;
      }
    }

    res.json({
      success: true,
      imported,
      updated,
      message: `Importados ${imported} canales nuevos, actualizados ${updated}`
    });

  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * Sincroniza los canales desde MongoDB hacia OpenClaw
 * Lee canales habilitados y escribe channels.json
 */
async function syncChannelsToOpenClaw() {
  try {
    const agentDir = process.env.OPENCLAW_AGENT_DIR || '/home/node/.openclaw/agents/main/agent';
    const channelsFile = path.join(agentDir, 'channels.json');

    // Crear directorio si no existe
    const fs = require('fs');
    if (!fs.existsSync(agentDir)) {
      fs.mkdirSync(agentDir, { recursive: true });
    }

    // Obtener canales habilitados desde MongoDB
    const channels = await Channel.find({ enabled: true }).sort({ order: 1, name: 1 }).lean();

    // Convertir al formato de OpenClaw
    const openclawChannels = {
      channels: channels.map(ch => ({
        id: ch.id,
        name: ch.name,
        description: ch.description,
        ...ch.config
      }))
    };

    // Escribir channels.json
    fs.writeFileSync(channelsFile, JSON.stringify(openclawChannels, null, 2), 'utf8');

    console.log(`[syncChannels] ✅ Sincronizados ${channels.length} canales a ${channelsFile}`);

    return {
      success: true,
      channelsCount: channels.length,
      file: channelsFile
    };

  } catch (error) {
    console.error('[syncChannels] Error:', error.message);
    return {
      success: false,
      error: error.message
    };
  }
}

module.exports = router;
module.exports.syncChannelsToOpenClaw = syncChannelsToOpenClaw;
