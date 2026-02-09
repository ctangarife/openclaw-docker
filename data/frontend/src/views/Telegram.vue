<template>
  <div class="telegram-page">
    <div class="header">
      <h1>Integración con Telegram</h1>
      <p class="subtitle">Configura el bot de Telegram para recibir respuestas de OpenClaw</p>
    </div>

    <!-- Estado actual -->
    <div class="status-card">
      <div class="status-header">
        <h2>Estado de la Integración</h2>
        <span class="badge" :class="{ enabled: config.enabled, disabled: !config.enabled }">
          {{ config.enabled ? 'Habilitado' : 'Deshabilitado' }}
        </span>
      </div>
      <div v-if="config.enabled" class="status-details">
        <div class="detail-row">
          <span class="label">Chat ID:</span>
          <span class="value">{{ config.chatId || 'No configurado' }}</span>
        </div>
        <div class="detail-row">
          <span class="label">Bot Token:</span>
          <span class="value">{{ config.botToken ? 'Configurado' : 'No configurado' }}</span>
        </div>
        <div class="detail-row">
          <span class="label">Channel ID:</span>
          <span class="value">{{ config.channelId || 'telegram' }}</span>
        </div>
        <div v-if="webhookInfo" class="detail-row">
          <span class="label">Webhook:</span>
          <span class="value" :class="{ success: webhookInfo.url, error: !webhookInfo.url }">
            {{ webhookInfo.url ? webhookInfo.url : 'No configurado' }}
          </span>
        </div>
      </div>
      <div v-else class="status-empty">
        <p>Telegram no está configurado. Completa el formulario para activar la integración.</p>
      </div>
    </div>

    <!-- Configuración -->
    <div class="config-section">
      <h2>Configuración del Bot</h2>

      <form @submit.prevent="saveConfig" class="form">
        <div class="form-group">
          <label>Bot Token *</label>
          <input
            v-model="form.botToken"
            type="text"
            placeholder="123456789:ABCdefGhIJKlmNoPQRsTUVwxyZ"
            class="input"
            :disabled="loading"
          />
          <small>
            Obtenlo de <a href="https://t.me/botfather" target="_blank">@BotFather</a> con el comando /newbot
          </small>
        </div>

        <div class="form-group">
          <label>Chat ID *</label>
          <input
            v-model="form.chatId"
            type="text"
            placeholder="123456789"
            class="input"
            :disabled="loading"
          />
          <small>
            Envía /start a tu bot y visita:
            <code>https://api.telegram.org/bot&lt;TOKEN&gt;/getUpdates</code>
          </small>
        </div>

        <div class="form-group">
          <label>Channel ID</label>
          <input
            v-model="form.channelId"
            type="text"
            placeholder="telegram"
            class="input"
            :disabled="loading"
          />
          <small>Identificador del canal en OpenClaw (opcional, default: telegram)</small>
        </div>

        <div class="form-group checkbox-group">
          <label>
            <input type="checkbox" v-model="form.enabled" />
            Habilitar integración con Telegram
          </label>
        </div>

        <div class="form-actions">
          <button type="button" class="btn-secondary" @click="loadConfig" :disabled="loading">
            Cancelar
          </button>
          <button type="submit" class="btn-primary" :disabled="loading">
            {{ loading ? 'Guardando...' : 'Guardar Configuración' }}
          </button>
        </div>
      </form>
    </div>

    <!-- Webhook -->
    <div v-if="config.enabled" class="webhook-section">
      <h2>Configurar Webhook</h2>
      <p class="webhook-description">
        El webhook permite que Telegram envíe mensajes a tu servidor. Configura la URL pública donde Telegram puede alcanzar tu servidor.
      </p>

      <div class="form-group">
        <label>URL del Webhook *</label>
        <input
          v-model="webhookUrl"
          type="text"
          placeholder="https://tu-dominio.com"
          class="input"
        />
        <small>La URL pública de tu servidor (sin /api/telegram/webhook)</small>
      </div>

      <div class="form-actions">
        <button class="btn-primary" @click="setWebhook" :disabled="!webhookUrl || settingWebhook">
          {{ settingWebhook ? 'Configurando...' : 'Configurar Webhook' }}
        </button>
        <button class="btn-secondary" @click="getWebhookInfo" :disabled="loadingWebhook">
          {{ loadingWebhook ? 'Consultando...' : 'Ver Webhook Actual' }}
        </button>
      </div>

      <div v-if="webhookResult" class="webhook-result" :class="{ success: webhookResult.success, error: !webhookResult.success }">
        <pre>{{ webhookResult.message || JSON.stringify(webhookResult, null, 2) }}</pre>
      </div>
    </div>

    <!-- Prueba -->
    <div v-if="config.enabled" class="test-section">
      <h2>Probar Integración</h2>
      <p>Envía un mensaje de prueba al chat configurado para verificar que todo funciona correctamente.</p>
      <button class="btn-primary" @click="sendTest" :disabled="sendingTest">
        {{ sendingTest ? 'Enviando...' : 'Enviar Mensaje de Prueba' }}
      </button>
      <div v-if="testResult" class="test-result" :class="{ success: testResult.success, error: !testResult.success }">
        {{ testResult.message }}
      </div>
    </div>

    <!-- Guía rápida -->
    <div class="guide-section">
      <h2>Guía de Configuración</h2>
      <div class="guide-steps">
        <div class="step">
          <div class="step-number">1</div>
          <div class="step-content">
            <h3>Crear el Bot</h3>
            <p>Abre Telegram y busca <a href="https://t.me/botfather" target="_blank">@BotFather</a>. Usa el comando <code>/newbot</code> y sigue las instrucciones. Guarda el token que te da.</p>
          </div>
        </div>
        <div class="step">
          <div class="step-number">2</div>
          <div class="step-content">
            <h3>Obtener tu Chat ID</h3>
            <p>Envía <code>/start</code> a tu bot en Telegram. Luego visita en tu navegador: <code>https://api.telegram.org/bot&lt;TU_TOKEN&gt;/getUpdates</code>. Busca <code>"chat":{"id":123456789}</code> - ese número es tu Chat ID.</p>
          </div>
        </div>
        <div class="step">
          <div class="step-number">3</div>
          <div class="step-content">
            <h3>Configurar en OpenClaw</h3>
            <p>Ingresa el token y el Chat ID en el formulario de arriba y habilita la integración.</p>
          </div>
        </div>
        <div class="step">
          <div class="step-number">4</div>
          <div class="step-content">
            <h3>Configurar el Webhook</h3>
            <p>Si tu servidor es público, configura el webhook con la URL pública. Para desarrollo local, usa un servicio como <code>ngrok</code>.</p>
          </div>
        </div>
        <div class="step">
          <div class="step-number">5</div>
          <div class="step-content">
            <h3>Probar</h3>
            <p>Envía un mensaje de prueba desde el botón de arriba o envía un mensaje directamente a tu bot en Telegram.</p>
          </div>
        </div>
      </div>
    </div>

    <!-- Mensajes -->
    <div v-if="error" class="error-banner">
      <span>⚠️</span>
      <span>{{ error }}</span>
      <button class="btn-close" @click="error = ''">×</button>
    </div>

    <div v-if="success" class="success-banner">
      <span>✅</span>
      <span>{{ success }}</span>
      <button class="btn-close" @click="success = ''">×</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from "vue";
import * as api from "../api";

interface TelegramConfig {
  enabled: boolean;
  chatId: string;
  channelId: string;
  botToken: string;
  updatedAt: string;
}

interface WebhookInfo {
  url: string;
  has_custom_certificate: boolean;
  pending_update_count: number;
}

const config = ref<Partial<TelegramConfig>>({ enabled: false });
const webhookInfo = ref<WebhookInfo | null>(null);

const form = ref({
  botToken: "",
  chatId: "",
  channelId: "telegram",
  enabled: false
});

const webhookUrl = ref("");
const webhookResult = ref<any>(null);
const testResult = ref<any>(null);

const loading = ref(false);
const settingWebhook = ref(false);
const loadingWebhook = ref(false);
const sendingTest = ref(false);
const error = ref("");
const success = ref("");

async function loadConfig() {
  try {
    const r = await fetch('/api/telegram/config', {
      headers: api.getHeaders()
    });
    if (!r.ok) throw new Error('Error al cargar configuración');
    const data = await r.json();
    config.value = data;
    form.value = {
      botToken: "",
      chatId: data.chatId || "",
      channelId: data.channelId || "telegram",
      enabled: data.enabled || false
    };
    if (data.enabled) {
      await getWebhookInfo();
    }
  } catch (e) {
    error.value = e instanceof Error ? e.message : "Error al cargar";
    setTimeout(() => error.value = "", 5000);
  }
}

async function saveConfig() {
  loading.value = true;
  error.value = "";
  success.value = "";

  try {
    const r = await fetch('/api/telegram/config', {
      method: 'POST',
      headers: {
        ...api.getHeaders(),
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(form.value)
    });
    if (!r.ok) {
      const err = await r.json();
      throw new Error(err.error || 'Error al guardar');
    }
    const data = await r.json();
    success.value = data.message || 'Configuración guardada correctamente';
    await loadConfig();
    setTimeout(() => success.value = "", 5000);
  } catch (e) {
    error.value = e instanceof Error ? e.message : "Error al guardar";
    setTimeout(() => error.value = "", 5000);
  } finally {
    loading.value = false;
  }
}

async function setWebhook() {
  settingWebhook.value = true;
  webhookResult.value = null;

  try {
    const r = await fetch('/api/telegram/set-webhook', {
      method: 'POST',
      headers: {
        ...api.getHeaders(),
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ webhookUrl: webhookUrl.value })
    });
    if (!r.ok) {
      const err = await r.json();
      throw new Error(err.error || 'Error al configurar webhook');
    }
    webhookResult.value = await r.json();
    await getWebhookInfo();
  } catch (e) {
    webhookResult.value = { success: false, message: e instanceof Error ? e.message : "Error al configurar webhook" };
  } finally {
    settingWebhook.value = false;
  }
}

async function getWebhookInfo() {
  loadingWebhook.value = true;

  try {
    const r = await fetch('/api/telegram/webhook-info', {
      headers: api.getHeaders()
    });
    if (!r.ok) throw new Error('Error al obtener info del webhook');
    const data = await r.json();
    webhookInfo.value = data.result;
  } catch (e) {
    console.error('Error obteniendo webhook info:', e);
  } finally {
    loadingWebhook.value = false;
  }
}

async function sendTest() {
  sendingTest.value = true;
  testResult.value = null;

  try {
    const r = await fetch('/api/telegram/test', {
      method: 'POST',
      headers: api.getHeaders()
    });
    if (!r.ok) {
      const err = await r.json();
      throw new Error(err.error || 'Error al enviar prueba');
    }
    testResult.value = await r.json();
  } catch (e) {
    testResult.value = { success: false, message: e instanceof Error ? e.message : "Error al enviar prueba" };
  } finally {
    sendingTest.value = false;
  }
}

onMounted(() => {
  loadConfig();
});
</script>

<style scoped>
.telegram-page {
  max-width: 1000px;
  margin: 0 auto;
  padding: 2rem;
}

.header {
  margin-bottom: 2rem;
}

.header h1 {
  margin: 0 0 0.5rem 0;
  font-size: 2rem;
  font-weight: 600;
}

.subtitle {
  color: #94a3b8;
  margin: 0;
}

/* Status Card */
.status-card {
  background: #1e293b;
  border: 1px solid #334155;
  border-radius: 8px;
  padding: 1.5rem;
  margin-bottom: 2rem;
}

.status-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1rem;
}

.status-header h2 {
  margin: 0;
  font-size: 1.25rem;
}

.badge {
  padding: 0.25rem 0.75rem;
  border-radius: 4px;
  font-size: 0.875rem;
  font-weight: 500;
}

.badge.enabled {
  background: #065f46;
  color: #6ee7b7;
}

.badge.disabled {
  background: #334155;
  color: #94a3b8;
}

.status-details {
  display: grid;
  gap: 0.75rem;
}

.detail-row {
  display: flex;
  gap: 1rem;
}

.detail-row .label {
  color: #94a3b8;
  font-weight: 500;
  min-width: 120px;
}

.detail-row .value {
  color: #e2e8f0;
}

.detail-row .value.success {
  color: #6ee7b7;
}

.detail-row .value.error {
  color: #fca5a5;
}

.status-empty {
  color: #94a3b8;
}

.status-empty p {
  margin: 0;
}

/* Sections */
.config-section,
.webhook-section,
.test-section,
.guide-section {
  background: #1e293b;
  border: 1px solid #334155;
  border-radius: 8px;
  padding: 1.5rem;
  margin-bottom: 1.5rem;
}

.config-section h2,
.webhook-section h2,
.test-section h2,
.guide-section h2 {
  margin: 0 0 1rem 0;
  font-size: 1.25rem;
}

.webhook-description {
  color: #94a3b8;
  margin: 0 0 1rem 0;
}

.test-section p {
  color: #94a3b8;
  margin: 0 0 1rem 0;
}

/* Form */
.form {
  display: grid;
  gap: 1.25rem;
}

.form-group {
  display: grid;
  gap: 0.5rem;
}

.form-group label {
  font-weight: 500;
  color: #e2e8f0;
}

.form-group small {
  color: #94a3b8;
  font-size: 0.875rem;
}

.form-group small a {
  color: #3b82f6;
  text-decoration: none;
}

.form-group small a:hover {
  text-decoration: underline;
}

.form-group small code {
  background: #334155;
  padding: 0.125rem 0.25rem;
  border-radius: 3px;
  font-size: 0.8125rem;
}

.input {
  padding: 0.75rem;
  background: #0f172a;
  border: 1px solid #334155;
  border-radius: 6px;
  color: white;
  font-size: 1rem;
  transition: border-color 0.2s;
}

.input:focus {
  outline: none;
  border-color: #3b82f6;
}

.input:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.checkbox-group label {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  cursor: pointer;
}

.checkbox-group input[type="checkbox"] {
  width: 1.25rem;
  height: 1.25rem;
  cursor: pointer;
}

.form-actions {
  display: flex;
  gap: 0.75rem;
  margin-top: 0.5rem;
}

.btn-primary,
.btn-secondary {
  padding: 0.75rem 1.5rem;
  border-radius: 6px;
  font-weight: 500;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  border: none;
  transition: all 0.2s;
}

.btn-primary {
  background: #3b82f6;
  color: white;
}

.btn-primary:hover:not(:disabled) {
  background: #2563eb;
}

.btn-secondary {
  background: #334155;
  color: white;
}

.btn-secondary:hover:not(:disabled) {
  background: #475569;
}

.btn-primary:disabled,
.btn-secondary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* Webhook Result */
.webhook-result,
.test-result {
  margin-top: 1rem;
  padding: 1rem;
  border-radius: 6px;
  font-size: 0.875rem;
}

.webhook-result.success,
.test-result.success {
  background: #065f46;
  color: #6ee7b7;
}

.webhook-result.error,
.test-result.error {
  background: #7f1d1d;
  color: #fca5a5;
}

.webhook-result pre {
  margin: 0;
  white-space: pre-wrap;
  word-break: break-word;
}

/* Guide */
.guide-steps {
  display: grid;
  gap: 1.5rem;
}

.step {
  display: flex;
  gap: 1rem;
}

.step-number {
  flex-shrink: 0;
  width: 2rem;
  height: 2rem;
  background: #3b82f6;
  color: white;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 600;
}

.step-content h3 {
  margin: 0 0 0.5rem 0;
  font-size: 1rem;
}

.step-content p {
  margin: 0;
  color: #94a3b8;
  line-height: 1.6;
}

.step-content code {
  background: #334155;
  padding: 0.125rem 0.25rem;
  border-radius: 3px;
  font-size: 0.875em;
}

.step-content a {
  color: #3b82f6;
  text-decoration: none;
}

.step-content a:hover {
  text-decoration: underline;
}

/* Banners */
.error-banner,
.success-banner {
  position: fixed;
  bottom: 1rem;
  right: 1rem;
  padding: 1rem 1.5rem;
  border-radius: 8px;
  display: flex;
  align-items: center;
  gap: 0.75rem;
  max-width: 400px;
  z-index: 1000;
}

.error-banner {
  background: #7f1d1d;
  color: #fca5a5;
}

.success-banner {
  background: #065f46;
  color: #6ee7b7;
}

.btn-close {
  background: none;
  border: none;
  color: inherit;
  font-size: 1.25rem;
  cursor: pointer;
  padding: 0;
  margin-left: auto;
}
</style>
