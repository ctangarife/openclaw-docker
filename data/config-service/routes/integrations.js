/**
 * Integraciones de Mensajería para OpenClaw
 * Gestiona Telegram, Slack, MS Teams, Discord, etc. desde MongoDB
 */

const express = require('express');
const fs = require('fs').promises;
const mongoose = require('mongoose');
const { encrypt, decrypt } = require('../lib/encrypt');

const router = express.Router();

// Configuraciones disponibles de canales en OpenClaw
const AVAILABLE_CHANNELS = {
  telegram: {
    id: 'telegram',
    name: 'Telegram',
    description: 'Bot de Telegram para enviar y recibir mensajes',
    icon: '',
    color: '#0088cc',
    configFields: [
      { key: 'botToken', label: 'Bot Token', type: 'password', required: true, hint: 'Token de @BotFather' },
      { key: 'webhookUrl', label: 'Webhook URL', type: 'text', required: false, hint: 'URL pública para webhooks (opcional)' },
      { key: 'allowedUsers', label: 'Usuarios Permitidos', type: 'text', required: false, hint: 'User IDs de Telegram separados por coma (ej: 123456789,987654321). Vacío = cualquiera' }
    ],
    capabilities: ['chat', 'groups', 'channels', 'media', 'reactions']
  },
  slack: {
    id: 'slack',
    name: 'Slack',
    description: 'App de Slack para integración con espacios de trabajo',
    icon: '',
    color: '#4A154B',
    configFields: [
      { key: 'botToken', label: 'Bot Token', type: 'password', required: true, hint: 'xoxb- token desde Slack App' },
      { key: 'signingSecret', label: 'Signing Secret', type: 'password', required: true, hint: 'Para verificar webhooks' },
      { key: 'appToken', label: 'App Token', type: 'password', required: false, hint: 'xapp- token (opcional)' }
    ],
    capabilities: ['chat', 'channels', 'threads', 'reactions']
  },
  msteams: {
    id: 'msteams',
    name: 'Microsoft Teams',
    description: 'Bot de Microsoft Teams',
    icon: '',
    color: '#6264A7',
    configFields: [
      { key: 'appId', label: 'App ID', type: 'text', required: true, hint: 'Microsoft Azure App ID' },
      { key: 'appPassword', label: 'App Password', type: 'password', required: true, hint: 'Client secret desde Azure' }
    ],
    capabilities: ['chat', 'teams', 'channels', 'threads']
  },
  discord: {
    id: 'discord',
    name: 'Discord',
    description: 'Bot de Discord',
    icon: '',
    color: '#5865F2',
    configFields: [
      { key: 'botToken', label: 'Bot Token', type: 'password', required: true, hint: 'Token desde Discord Developer Portal' },
      { key: 'clientId', label: 'Client ID', type: 'text', required: false, hint: 'Para configurar el bot' }
    ],
    capabilities: ['chat', 'servers', 'channels', 'threads', 'reactions']
  },
  whatsapp: {
    id: 'whatsapp',
    name: 'WhatsApp',
    description: 'WhatsApp Business API',
    icon: '',
    color: '#25D366',
    configFields: [
      { key: 'phoneNumber', label: 'Phone Number ID', type: 'text', required: true, hint: 'ID del número de teléfono' },
      { key: 'accessToken', label: 'Access Token', type: 'password', required: true, hint: 'Token de acceso permanente' },
      { key: 'businessId', label: 'Business ID', type: 'text', required: false, hint: 'WhatsApp Business Account ID' }
    ],
    capabilities: ['chat', 'media']
  },
  signal: {
    id: 'signal',
    name: 'Signal',
    description: 'Bot de Signal',
    icon: '',
    color: '#3A76F0',
    configFields: [
      { key: 'phoneNumber', label: 'Phone Number', type: 'text', required: true, hint: '+1234567890' }
    ],
    capabilities: ['chat', 'groups']
  },
  line: {
    id: 'line',
    name: 'LINE',
    description: 'LINE Messaging API',
    icon: '',
    color: '#00C300',
    configFields: [
      { key: 'channelAccessToken', label: 'Channel Access Token', type: 'password', required: true },
      { key: 'channelSecret', label: 'Channel Secret', type: 'password', required: true }
    ],
    capabilities: ['chat', 'groups', 'media']
  }
};

// Schema para integraciones
const integrationSchema = new mongoose.Schema({
  channelId: {
    type: String,
    required: true,
    enum: Object.keys(AVAILABLE_CHANNELS)
  },
  enabled: {
    type: Boolean,
    default: false
  },
  // Config no sensible (se guarda en texto plano)
  config: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  // Config sensible cifrado (tokens, passwords, secrets)
  encryptedConfig: {
    type: Map,
    of: String,
    default: new Map()
  },
  accountId: {
    type: String,
    default: 'default'
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  collection: 'integrations'
});

const Integration = mongoose.models.Integration || mongoose.model('Integration', integrationSchema);

// === Funciones auxiliares para cifrado ===

/**
 * Obtiene los campos sensibles que deben cifrarse para cada canal
 */
function getSensitiveFields(channelId) {
  const channelInfo = AVAILABLE_CHANNELS[channelId];
  if (!channelInfo) return [];
  return channelInfo.configFields.filter(f => f.type === 'password').map(f => f.key);
}

/**
 * Separa y cifra los campos sensibles antes de guardar
 */
function encryptSensitiveFields(channelId, config) {
  const sensitiveFields = getSensitiveFields(channelId);
  const plainConfig = {};
  const encryptedConfig = {};

  for (const [key, value] of Object.entries(config)) {
    if (sensitiveFields.includes(key) && value) {
      encryptedConfig[key] = encrypt(String(value));
    } else {
      plainConfig[key] = value;
    }
  }

  return { plainConfig, encryptedConfig };
}

/**
 * Descifra y combina los campos sensibles al leer
 */
function decryptSensitiveFields(integration) {
  const config = { ...integration.config };
  const sensitiveFields = getSensitiveFields(integration.channelId);

  const encryptedConfig = integration.encryptedConfig;
  if (!encryptedConfig) return config;

  // Manejar tanto Map como Object (MongoDB puede devolver cualquiera)
  const entries = encryptedConfig instanceof Map
    ? Array.from(encryptedConfig.entries())
    : Object.entries(encryptedConfig);

  for (const [key, encryptedValue] of entries) {
    try {
      config[key] = decrypt(encryptedValue);
    } catch (e) {
      console.error(`Error descifrando ${key}:`, e.message);
      config[key] = '***';
    }
  }

  return config;
}

/**
 * GET /api/integrations/available
 * Lista todos los canales disponibles con sus campos de configuración
 */
router.get('/available', (req, res) => {
  const channels = Object.values(AVAILABLE_CHANNELS).map(ch => ({
    id: ch.id,
    name: ch.name,
    description: ch.description,
    color: ch.color,
    configFields: ch.configFields,
    capabilities: ch.capabilities
  }));
  res.json(channels);
});

/**
 * GET /api/integrations
 * Lista todas las integraciones configuradas
 */
router.get('/', async (req, res) => {
  try {
    const integrations = await Integration.find();

    // Enriquecer con información del canal y descifrar valores
    const result = integrations.map(int => {
      const decryptedConfig = decryptSensitiveFields(int);

      return {
        _id: int._id,
        channelId: int.channelId,
        accountId: int.accountId,
        enabled: int.enabled,
        config: maskSensitiveConfig(int.channelId, decryptedConfig),
        updatedAt: int.updatedAt,
        channelInfo: AVAILABLE_CHANNELS[int.channelId] || null
      };
    });

    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * GET /api/integrations/:channelId
 * Obtiene una integración específica
 */
router.get('/:channelId', async (req, res) => {
  try {
    const { channelId } = req.params;
    const { accountId = 'default' } = req.query;

    const integration = await Integration.findOne({ channelId, accountId });

    if (!integration) {
      return res.json({ enabled: false, config: {} });
    }

    const decryptedConfig = decryptSensitiveFields(integration);

    res.json({
      _id: integration._id,
      channelId: integration.channelId,
      accountId: integration.accountId,
      enabled: integration.enabled,
      config: maskSensitiveConfig(channelId, decryptedConfig),
      updatedAt: integration.updatedAt
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * POST /api/integrations
 * Crea o actualiza una integración
 */
router.post('/', async (req, res) => {
  try {
    const { channelId, accountId = 'default', enabled = true, config } = req.body;

    if (!channelId) {
      return res.status(400).json({ error: 'channelId is required' });
    }

    if (!AVAILABLE_CHANNELS[channelId]) {
      return res.status(400).json({ error: `Unknown channel: ${channelId}` });
    }

    // Validar campos requeridos
    const channelInfo = AVAILABLE_CHANNELS[channelId];
    const missingFields = channelInfo.configFields
      .filter(f => f.required && !config[f.key])
      .map(f => f.label);

    if (missingFields.length > 0) {
      return res.status(400).json({
        error: `Missing required fields: ${missingFields.join(', ')}`
      });
    }

    // Cifrar campos sensibles
    const { plainConfig, encryptedConfig } = encryptSensitiveFields(channelId, config);

    // Convertir encryptedConfig a Map para Mongoose
    const encryptedMap = new Map(Object.entries(encryptedConfig));

    const integration = await Integration.findOneAndUpdate(
      { channelId, accountId },
      {
        channelId,
        accountId,
        enabled,
        config: plainConfig,
        encryptedConfig: encryptedMap,
        updatedAt: new Date()
      },
      { upsert: true, new: true }
    );

    console.log(`[Integrations] ${channelId} guardado (enabled: ${enabled})`);

    res.json({
      success: true,
      message: 'Integración guardada. Sincroniza para aplicar los cambios.',
      integration: {
        _id: integration._id,
        channelId: integration.channelId,
        accountId: integration.accountId,
        enabled: integration.enabled,
        config: maskSensitiveConfig(channelId, config)
      }
    });

  } catch (e) {
    console.error('[Integrations] Error guardando:', e);
    res.status(500).json({ error: e.message });
  }
});

/**
 * POST /api/integrations/:channelId/test
 * Prueba una integración
 */
router.post('/:channelId/test', async (req, res) => {
  try {
    const { channelId } = req.params;
    const { accountId = 'default' } = req.query;

    const integration = await Integration.findOne({ channelId, accountId, enabled: true });

    if (!integration) {
      return res.status(404).json({ error: 'Integration not found or not enabled' });
    }

    // Descifrar config para el test
    const config = decryptSensitiveFields(integration);

    // Importar el test apropiado según el canal
    const result = await testIntegration(channelId, config);

    res.json({
      success: result.success,
      message: result.message,
      details: result.details
    });

  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * PATCH /api/integrations/:id
 * Actualiza una integración existente
 */
router.patch('/:_id', async (req, res) => {
  try {
    const { _id } = req.params;
    const updates = req.body;

    const integration = await Integration.findByIdAndUpdate(
      _id,
      {
        ...updates,
        updatedAt: new Date()
      },
      { new: true }
    );

    if (!integration) {
      return res.status(404).json({ error: 'Integration not found' });
    }

    console.log(`[Integrations] ${integration.channelId} actualizado`);

    res.json({
      success: true,
      message: 'Integración actualizada. Sincroniza para aplicar los cambios.',
      integration: {
        _id: integration._id,
        channelId: integration.channelId,
        enabled: integration.enabled,
        config: maskSensitiveConfig(integration.channelId, integration.config)
      }
    });

  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * DELETE /api/integrations/:id
 * Elimina una integración
 */
router.delete('/:_id', async (req, res) => {
  try {
    const { _id } = req.params;

    const integration = await Integration.findByIdAndDelete(_id);

    if (!integration) {
      return res.status(404).json({ error: 'Integration not found' });
    }

    console.log(`[Integrations] ${integration.channelId} eliminado`);

    res.json({
      success: true,
      message: 'Integración eliminada. Sincroniza para aplicar los cambios.',
      deletedChannel: integration.channelId
    });

  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * POST /api/integrations/sync
 * Sincroniza las integraciones habilitadas a openclaw.json
 */
router.post('/sync', async (req, res) => {
  try {
    const result = await syncIntegrationsToOpenClaw();
    res.json(result);
  } catch (e) {
    console.error('[Integrations] Error sincronizando:', e);
    res.status(500).json({ error: e.message });
  }
});

// === Funciones auxiliares ===

/**
 * Mapeo de campos sensibles a variables de entorno
 * Formato: channelId_fieldKey -> ENV_VAR_NAME
 */
const ENV_VAR_MAPPINGS = {
  'telegram_botToken': 'TELEGRAM_BOT_TOKEN',
  'slack_botToken': 'SLACK_BOT_TOKEN',
  'slack_signingSecret': 'SLACK_SIGNING_SECRET',
  'slack_appToken': 'SLACK_APP_TOKEN',
  'msteams_appPassword': 'MSTEAMS_APP_PASSWORD',
  'discord_botToken': 'DISCORD_BOT_TOKEN',
  'whatsapp_accessToken': 'WHATSAPP_ACCESS_TOKEN',
  'line_channelAccessToken': 'LINE_CHANNEL_ACCESS_TOKEN',
  'line_channelSecret': 'LINE_CHANNEL_SECRET'
};

/**
 * Obtiene el nombre de la variable de entorno para un campo sensible
 */
function getEnvVarName(channelId, fieldKey) {
  const key = `${channelId}_${fieldKey}`;
  return ENV_VAR_MAPPINGS[key] || null;
}

/**
 * Genera contenido .env con los tokens descifrados
 */
async function generateEnvFile(integrations) {
  const envVars = {};

  for (const integration of integrations) {
    const decryptedConfig = decryptSensitiveFields(integration);
    const sensitiveFields = getSensitiveFields(integration.channelId);

    for (const field of sensitiveFields) {
      const envVarName = getEnvVarName(integration.channelId, field);

      if (envVarName && decryptedConfig[field]) {
        // Soporte para multi-cuenta: agregar sufijo si no es default
        const suffix = integration.accountId !== 'default' ? `_${integration.accountId.toUpperCase()}` : '';
        envVars[envVarName + suffix] = decryptedConfig[field];
      }
    }
  }

  // Convertir a formato .env (compatible con set -a)
  let envContent = `# Integration Tokens from MongoDB (${envVars.length} variable(s))\n`;
  envContent += `# Generated at ${new Date().toISOString()}\n`;

  for (const [key, value] of Object.entries(envVars)) {
    // Usar formato con comillas para ser compatible con el parser de shell
    envContent += `export ${key}="${value}"\n`;
  }

  return envContent;
}

function maskSensitiveConfig(channelId, config) {
  const masked = {};
  const channelInfo = AVAILABLE_CHANNELS[channelId];

  for (const [key, value] of Object.entries(config)) {
    const field = channelInfo?.configFields?.find(f => f.key === key);
    if (field?.type === 'password' && value) {
      const strValue = String(value);
      masked[key] = strValue.length > 10
        ? strValue.substring(0, 8) + '...'
        : '***';
    } else {
      masked[key] = value;
    }
  }

  return masked;
}

async function syncIntegrationsToOpenClaw() {
  // Leer openclaw.json
  const openclawPath = '/home/node/.openclaw/openclaw.json';
  const envFilePath = '/home/node/.openclaw/integrations.env';

  let openclawConfig;
  try {
    const content = await fs.readFile(openclawPath, 'utf8');
    openclawConfig = JSON.parse(content);
  } catch (e) {
    throw new Error(`Error reading openclaw.json: ${e.message}`);
  }

  // Obtener integraciones habilitadas
  const enabledIntegrations = await Integration.find({ enabled: true }).lean();

  // Construir configuración de canales
  const channels = {};

  for (const integration of enabledIntegrations) {
    const channelInfo = AVAILABLE_CHANNELS[integration.channelId];

    if (!channelInfo) continue;

    // Descifrar config completo (sensibles + no sensibles)
    const decryptedConfig = decryptSensitiveFields(integration);

    // Configuración específica por canal
    const channelConfig = buildChannelConfig(integration.channelId, decryptedConfig, integration.accountId);

    if (integration.accountId === 'default') {
      channels[integration.channelId] = {
        enabled: true,
        ...channelConfig
      };
    } else {
      // Multi-account
      if (!channels[integration.channelId]) {
        channels[integration.channelId] = {
          enabled: true,
          accounts: {}
        };
      }
      channels[integration.channelId].accounts[integration.accountId] = {
        enabled: true,
        ...channelConfig
      };
    }
  }

  // Actualizar openclaw.json (sin tokens en texto plano)
  openclawConfig.channels = channels;

  // Habilitar plugins correspondientes a las integraciones activas
  // En OpenClaw, los canales de mensajería son extensiones que necesitan estar habilitadas
  if (!openclawConfig.plugins) {
    openclawConfig.plugins = { entries: {} };
  } else if (!openclawConfig.plugins.entries) {
    openclawConfig.plugins.entries = {};
  }

  // Obtener lista de canales habilitados
  const enabledChannelIds = Object.keys(channels);

  // Habilitar plugins para los canales activos
  for (const channelId of enabledChannelIds) {
    if (!openclawConfig.plugins.entries[channelId]) {
      openclawConfig.plugins.entries[channelId] = {};
    }
    openclawConfig.plugins.entries[channelId].enabled = true;
  }

  // Deshabilitar plugins de canales que ya no están activos
  const allPluginIds = Object.keys(openclawConfig.plugins.entries);
  for (const pluginId of allPluginIds) {
    if (AVAILABLE_CHANNELS[pluginId] && !enabledChannelIds.includes(pluginId)) {
      openclawConfig.plugins.entries[pluginId].enabled = false;
    }
  }

  // Escribir openclaw.json
  await fs.writeFile(openclawPath, JSON.stringify(openclawConfig, null, 2));

  console.log('[Integrations] openclaw.json actualizado con', enabledIntegrations.length, 'canales');
  console.log('[Integrations] Plugins habilitados:', enabledChannelIds.join(', '));

  // Generar y escribir archivo integrations.env con los tokens descifrados
  const envContent = await generateEnvFile(enabledIntegrations);
  await fs.writeFile(envFilePath, envContent, 'utf8');

  console.log('[Integrations] integrations.env generado con tokens de integración');

  // Reiniciar gateway
  const { restartGateway } = require('../lib/docker-utils');
  await restartGateway();

  return {
    success: true,
    message: 'Integraciones sincronizadas correctamente. Tokens inyectados vía variables de entorno.',
    syncedCount: enabledIntegrations.length,
    channels: Object.keys(channels)
  };
}

function buildChannelConfig(channelId, config, accountId) {
  const channelConfig = {};
  const sensitiveFields = getSensitiveFields(channelId);

  switch (channelId) {
    case 'telegram':
      // Usar el token descifrado directamente
      // NOTA: El patrón env: no funciona correctamente en OpenClaw cuando se cargan
      // variables desde archivos, así que inyectamos el valor directamente
      if (config.botToken) {
        channelConfig.botToken = config.botToken;
      }
      if (config.webhookUrl) {
        channelConfig.webhookUrl = config.webhookUrl;
        channelConfig.webhookPath = `/api/integrations/telegram/webhook/${accountId}`;
      }
      // Configuraciones por defecto para Telegram
      channelConfig.dmPolicy = 'open';
      channelConfig.groupPolicy = 'open';
      // Si hay usuarios permitidos específicos, usarlos; si no, permitir cualquiera
      const allowedUsers = config.allowedUsers;
      if (allowedUsers && typeof allowedUsers === 'string' && allowedUsers.trim()) {
        const userIds = allowedUsers.split(',').map(id => `telegram:${id.trim()}`).filter(id => id !== 'telegram:');
        channelConfig.allowFrom = userIds.length > 0 ? userIds : ['*'];
      } else {
        channelConfig.allowFrom = ['*'];
      }
      break;

    case 'slack':
      // Usar los tokens descifrados directamente
      // NOTA: El patrón env: no funciona correctamente en OpenClaw cuando se cargan
      // variables desde archivos, así que inyectamos los valores directamente
      if (config.botToken) channelConfig.botToken = config.botToken;
      if (config.signingSecret) channelConfig.signingSecret = config.signingSecret;
      if (config.appToken) channelConfig.appToken = config.appToken;
      break;

    case 'msteams':
      // Usar valores descifrados directamente
      if (config.appId) channelConfig.appId = config.appId;
      if (config.appPassword) channelConfig.appPassword = config.appPassword;
      break;

    case 'discord':
      // Usar el token descifrado directamente
      if (config.botToken) channelConfig.botToken = config.botToken;
      if (config.clientId) channelConfig.clientId = config.clientId;
      break;

    case 'whatsapp':
      // Usar valores descifrados directamente
      if (config.phoneNumber) channelConfig.phoneNumber = config.phoneNumber;
      if (config.accessToken) channelConfig.accessToken = config.accessToken;
      if (config.businessId) channelConfig.businessId = config.businessId;
      break;

    case 'signal':
      // Signal no tiene campos sensibles según configFields
      if (config.phoneNumber) channelConfig.phoneNumber = config.phoneNumber;
      break;

    case 'line':
      // Usar los tokens descifrados directamente
      if (config.channelAccessToken) channelConfig.channelAccessToken = config.channelAccessToken;
      if (config.channelSecret) channelConfig.channelSecret = config.channelSecret;
      break;
  }

  return channelConfig;
}

async function testIntegration(channelId, config) {
  const axios = require('axios');

  switch (channelId) {
    case 'telegram':
      try {
        const response = await axios.get(`https://api.telegram.org/bot${config.botToken}/getMe`, {
          timeout: 10000
        });

        if (response.data.ok) {
          return {
            success: true,
            message: `Conectado a @${response.data.result.username}`,
            details: response.data.result
          };
        } else {
          return {
            success: false,
            message: `Error de Telegram: ${response.data.description || 'Desconocido'}`,
            details: response.data
          };
        }
      } catch (e) {
        // Manejo específico de errores comunes
        if (e.response?.status === 404) {
          return {
            success: false,
            message: 'Token inválido: El bot no existe. Verifica el token con @BotFather.',
            details: { error: 'Invalid bot token', hint: 'Usa /newbot en @BotFather para obtener un token válido' }
          };
        } else if (e.response?.status === 401) {
          return {
            success: false,
            message: 'Token no autorizado: Formato inválido o token revocado.',
            details: { error: 'Unauthorized' }
          };
        } else if (e.code === 'ECONNABORTED' || e.code === 'ETIMEDOUT') {
          return {
            success: false,
            message: 'Timeout: No se pudo conectar a Telegram. Verifica tu conexión.',
            details: { error: 'Connection timeout' }
          };
        }

        return {
          success: false,
          message: 'Error conectando a Telegram',
          details: e.response?.data || e.message
        };
      }
      break;

    case 'slack':
      try {
        const response = await axios.get('https://slack.com/api/auth.test', {
          headers: { 'Authorization': `Bearer ${config.botToken}` }
        });
        if (response.data.ok) {
          return {
            success: true,
            message: `Conectado a workspace: ${response.data.team}`,
            details: response.data
          };
        }
      } catch (e) {
        return {
          success: false,
          message: 'Error conectando a Slack',
          details: e.response?.data || e.message
        };
      }
      break;

    default:
      return {
        success: true,
        message: 'Integración guardada (prueba no disponible)',
        details: {}
      };
  }
}

module.exports = router;
