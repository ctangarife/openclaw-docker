/**
 * Servicio de Telegram para OpenClaw
 * Recibe webhooks de Telegram y los reenvía a OpenClaw Gateway
 * Con sistema de colas FIFO y rate limiting por provider
 */

const express = require('express');
const axios = require('axios');
const mongoose = require('mongoose');
const { globalClient: openclawClient } = require('../lib/openclaw-client');

const router = express.Router();

// Schema para configuración de Telegram (se guarda en app_config)
const telegramConfigSchema = new mongoose.Schema({
  botToken: {
    type: String,
    required: true
  },
  chatId: {
    type: String,
    required: true
  },
  channelId: {
    type: String,
    default: 'telegram'
  },
  enabled: {
    type: Boolean,
    default: false
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, { collection: 'telegram_config' });

const TelegramConfig = mongoose.models.TelegramConfig || mongoose.model('TelegramConfig', telegramConfigSchema);

/**
 * GET /api/telegram/config
 * Obtiene la configuración actual de Telegram
 */
router.get('/config', async (req, res) => {
  try {
    const config = await TelegramConfig.findOne().sort({ updatedAt: -1 }).lean();
    if (!config) {
      return res.json({ enabled: false });
    }
    // No retornar el token completo por seguridad
    res.json({
      enabled: config.enabled,
      chatId: config.chatId,
      channelId: config.channelId,
      botToken: config.botToken ? `${config.botToken.substring(0, 10)}...` : null,
      updatedAt: config.updatedAt
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * POST /api/telegram/config
 * Guarda la configuración de Telegram
 */
router.post('/config', async (req, res) => {
  try {
    const { botToken, chatId, channelId, enabled } = req.body;

    if (!botToken || !chatId) {
      return res.status(400).json({ error: 'botToken and chatId are required' });
    }

    // Validar formato del token
    if (!botToken.match(/^\d+:[A-Za-z0-9_-]{35}$/)) {
      return res.status(400).json({ error: 'Invalid bot token format' });
    }

    // Actualizar o crear configuración
    const config = await TelegramConfig.findOneAndUpdate(
      {},
      {
        botToken,
        chatId: chatId.toString(),
        channelId: channelId || 'telegram',
        enabled: enabled !== undefined ? enabled : true,
        updatedAt: new Date()
      },
      { upsert: true, new: true }
    );

    console.log('[Telegram] Configuración guardada');

    res.json({
      success: true,
      message: 'Configuración guardada. Configura el webhook de Telegram.'
    });

  } catch (e) {
    console.error('[Telegram] Error guardando config:', e);
    res.status(500).json({ error: e.message });
  }
});

/**
 * POST /api/telegram/webhook
 * Webhook que recibe mensajes de Telegram
 * Esta ruta debe ser accesible desde internet (no requiere auth)
 */
router.post('/webhook', async (req, res) => {
  try {
    const message = req.body.message;

    if (!message || !message.text) {
      return res.sendStatus(200);
    }

    const userMessage = message.text;
    const chatId = message.chat.id;
    const messageId = message.message_id;

    console.log(`[Telegram] Mensaje recibido de chat ${chatId}: "${userMessage}"`);

    // Verificar que Telegram esté configurado y habilitado
    const config = await TelegramConfig.findOne({ enabled: true });
    if (!config) {
      console.log('[Telegram] Telegram no está configurado o habilitado');
      return res.sendStatus(200);
    }

    // Verificar que el mensaje viene del chat configurado
    if (chatId.toString() !== config.chatId) {
      console.log(`[Telegram] Chat ID ${chatId} no coincide con configurado ${config.chatId}`);
      return res.sendStatus(200);
    }

    // Enviar a OpenClaw Gateway con sistema de colas y retries
    console.log(`[Telegram] Enviando a OpenClaw: "${userMessage}"`);

    try {
      const openclawResponse = await openclawClient.chat({
        model: 'anthropic/claude-3-5-haiku-20241022',
        messages: [
          { role: 'user', content: userMessage }
        ],
        maxTokens: 4096,
        metadata: {
          channel: 'telegram',
          chatId: chatId,
          messageId: messageId
        }
      });

      const reply = openclawResponse.content[0].text;

      // Si se usó fallback, notificar al usuario
      let finalReply = reply;
      if (openclawResponse.fallback) {
        finalReply = `⚠️ Usando modelo alternativo (${openclawResponse.model.split('/').pop()})\n\n${reply}`;
      }

      // Enviar respuesta a Telegram
      const telegramUrl = `https://api.telegram.org/bot${config.botToken}/sendMessage`;

      await axios.post(telegramUrl, {
        chat_id: chatId,
        text: finalReply,
        parse_mode: 'Markdown'
      });

      console.log(`[Telegram] ✅ Respuesta enviada a Telegram (${openclawResponse.duration}ms, ${openclawResponse.attempts} intentos)`);

      res.sendStatus(200);

    } catch (openclawError) {
      // Error de OpenClaw (agotados reintentos y fallback)
      console.error(`[Telegram] ❌ Error de OpenClaw:`, openclawError.message);

      // Enviar mensaje de error al usuario
      try {
        await axios.post(`https://api.telegram.org/bot${config.botToken}/sendMessage`, {
          chat_id: chatId,
          text: '❌ Lo siento, el servicio está sobrecargado. Inténtalo de nuevo en unos momentos.'
        });
      } catch (e) {
        // Ignorar errores al enviar error
      }

      res.sendStatus(200);
    }
  } catch (error) {
    console.error('[Telegram] Error procesando webhook:', error.message);
    res.sendStatus(200);
  }
});

/**
 * POST /api/telegram/set-webhook
 * Configura el webhook en Telegram
 */
router.post('/set-webhook', async (req, res) => {
  try {
    const config = await TelegramConfig.findOne({ enabled: true });

    if (!config) {
      return res.status(400).json({ error: 'Telegram no está configurado' });
    }

    // Obtener la URL pública desde la variable de entorno o usar la del request
    const publicUrl = req.body.webhookUrl || process.env.TELEGRAM_WEBHOOK_URL;

    if (!publicUrl) {
      return res.status(400).json({
        error: 'Debes proporcionar webhookUrl o configurar TELEGRAM_WEBHOOK_URL'
      });
    }

    const webhookUrl = `${publicUrl}/api/telegram/webhook`;

    console.log(`[Telegram] Configurando webhook: ${webhookUrl}`);

    const response = await axios.post(
      `https://api.telegram.org/bot${config.botToken}/setWebhook`,
      { url: webhookUrl }
    );

    res.json({
      success: true,
      webhookUrl,
      result: response.data,
      message: 'Webhook configurado. Telegram enviará mensajes a esta URL.'
    });

  } catch (error) {
    console.error('[Telegram] Error configurando webhook:', error.message);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/telegram/webhook-info
 * Obtiene información del webhook actual en Telegram
 */
router.get('/webhook-info', async (req, res) => {
  try {
    const config = await TelegramConfig.findOne();

    if (!config) {
      return res.status(404).json({ error: 'Telegram no está configurado' });
    }

    const response = await axios.get(
      `https://api.telegram.org/bot${config.botToken}/getWebhookInfo`
    );

    res.json(response.data);

  } catch (error) {
    console.error('[Telegram] Error obteniendo webhook info:', error.message);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/telegram/test
 * Envía un mensaje de prueba al chat configurado
 */
router.post('/test', async (req, res) => {
  try {
    const config = await TelegramConfig.findOne({ enabled: true });

    if (!config) {
      return res.status(400).json({ error: 'Telegram no está configurado o habilitado' });
    }

    const response = await axios.post(
      `https://api.telegram.org/bot${config.botToken}/sendMessage`,
      {
        chat_id: config.chatId,
        text: '✅ *Telegram integrado con OpenClaw*\\n\\nEnvía un mensaje y te responderé usando Claude.',
        parse_mode: 'Markdown'
      }
    );

    res.json({
      success: true,
      message: 'Mensaje de prueba enviado',
      result: response.data
    });

  } catch (error) {
    console.error('[Telegram] Error enviando prueba:', error.response?.data || error.message);
    res.status(500).json({
      error: error.response?.data?.description || error.message
    });
  }
});

/**
 * DELETE /api/telegram/config
 * Elimina la configuración de Telegram
 */
router.delete('/config', async (req, res) => {
  try {
    await TelegramConfig.deleteMany({});
    res.json({ success: true, message: 'Configuración eliminada' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
