<template>
  <div class="integrations-page">
    <div class="header">
      <h1>Integraciones</h1>
      <p class="subtitle">Configura plataformas de mensajería para conectar con OpenClaw</p>
      <div class="header-actions">
        <button class="btn-secondary" @click="syncNow" :disabled="syncing">
          <span v-if="syncing">🔄</span>
          <span v-else>🔄</span>
          {{ syncing ? 'Sincronizando...' : 'Sincronizar' }}
        </button>
      </div>
    </div>

    <!-- Lista de integraciones disponibles -->
    <div v-if="availableChannels.length" class="channels-grid">
      <div
        v-for="channel in availableChannels"
        :key="channel.id"
        class="channel-card"
        :class="{ active: selectedChannel?.id === channel.id }"
        @click="selectChannel(channel)"
      >
        <div class="channel-header">
          <div class="channel-icon" :style="{ background: channel.color }">
            {{ channel.name.charAt(0) }}
          </div>
          <div class="channel-info">
            <h3>{{ channel.name }}</h3>
            <p>{{ channel.description }}</p>
          </div>
          <div v-if="isChannelConfigured(channel.id)" class="status-badge configured">
            ✓
          </div>
        </div>
        <div class="channel-capabilities">
          <span
            v-for="cap in channel.capabilities"
            :key="cap"
            class="capability-badge"
            :title="cap"
          >
            {{ getCapabilityIcon(cap) }}
          </span>
        </div>
      </div>
    </div>

    <!-- Panel de configuración -->
    <div v-if="selectedChannel" class="config-panel">
      <div class="panel-header">
        <h2>
          <span class="panel-icon" :style="{ background: selectedChannel.color }">
            {{ selectedChannel.name.charAt(0) }}
          </span>
          Configurar {{ selectedChannel.name }}
        </h2>
        <button class="btn-close" @click="closePanel">×</button>
      </div>

      <div class="panel-content">
        <form @submit.prevent="saveIntegration" class="form">
          <!-- Campos de configuración -->
          <div v-for="field in selectedChannel.configFields" :key="field.key" class="form-group">
            <label>
              {{ field.label }}
              <span v-if="field.required" class="required">*</span>
            </label>
            <div class="input-wrapper">
              <input
                v-if="field.type === 'text' || field.type === 'password'"
                v-model="form.config[field.key]"
                :type="field.type"
                :placeholder="getPlaceholder(field)"
                class="input"
                :class="{ 'masked-value': isValueMasked(form.config[field.key]) }"
                :required="field.required && !isValueMasked(form.config[field.key])"
              />
              <span v-if="isValueMasked(form.config[field.key])" class="masked-badge">
                Valor guardado (deja vacío para mantener)
              </span>
            </div>
            <small v-if="field.hint">{{ field.hint }}</small>
          </div>

          <div class="form-group">
            <label>Account ID</label>
            <input
              v-model="form.accountId"
              type="text"
              placeholder="default"
              class="input"
            />
            <small>Para múltiples cuentas del mismo servicio, usa IDs diferentes (default, account1, etc.)</small>
          </div>

          <div class="form-group checkbox-group">
            <label>
              <input type="checkbox" v-model="form.enabled" />
              Habilitar esta integración
            </label>
          </div>

          <div class="form-actions">
            <button type="button" class="btn-secondary" @click="testIntegration" :disabled="testing">
              {{ testing ? 'Probando...' : '🧪 Probar Conexión' }}
            </button>
            <button type="submit" class="btn-primary" :disabled="loading">
              {{ loading ? 'Guardando...' : '💾 Guardar' }}
            </button>
          </div>
        </form>

        <!-- Resultados de prueba -->
        <div v-if="testResult" class="test-result" :class="{ success: testResult.success, error: !testResult.success }">
          <span>{{ testResult.success ? '✅' : '❌' }}</span>
          <div>
            <strong>{{ testResult.message }}</strong>
            <pre v-if="testResult.details">{{ JSON.stringify(testResult.details, null, 2) }}</pre>
          </div>
        </div>
      </div>
    </div>

    <!-- Lista de integraciones configuradas -->
    <div v-if="configuredIntegrations.length" class="configured-list">
      <h2>Integraciones Configuradas</h2>
      <div class="configured-items">
        <div
          v-for="integration in configuredIntegrations"
          :key="integration._id"
          class="configured-item"
          :class="{ disabled: !integration.enabled }"
        >
          <div class="item-info">
            <div class="item-header">
              <span class="item-icon" :style="{ background: integration.channelInfo?.color || '#64748b' }">
                {{ integration.channelInfo?.name?.charAt(0) || '?' }}
              </span>
              <div>
                <h4>{{ integration.channelInfo?.name || integration.channelId }}</h4>
                <small>Account: {{ integration.accountId }}</small>
              </div>
              <span class="status-badge" :class="{ enabled: integration.enabled }">
                {{ integration.enabled ? 'Habilitado' : 'Deshabilitado' }}
              </span>
            </div>
            <div v-if="Object.keys(integration.config).length" class="item-config">
              <span v-for="(value, key) in integration.config" :key="key" class="config-item">
                <strong>{{ key }}:</strong>
                <span v-if="typeof value === 'object' && value._masked">{{ value.value || '***' }}</span>
                <span v-else>{{ value }}</span>
              </span>
            </div>
          </div>
          <div class="item-actions">
            <button class="btn-icon" @click="editIntegration(integration)" title="Editar">✏️</button>
            <button class="btn-icon" @click="deleteIntegration(integration)" title="Eliminar">🗑️</button>
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
import { ref, computed, onMounted } from "vue";
import * as api from "../api";

interface ChannelField {
  key: string;
  label: string;
  type: string;
  required: boolean;
  hint: string;
}

interface AvailableChannel {
  id: string;
  name: string;
  description: string;
  color: string;
  configFields: ChannelField[];
  capabilities: string[];
}

interface Integration {
  _id: string;
  channelId: string;
  accountId: string;
  enabled: boolean;
  config: Record<string, string>;
  channelInfo: AvailableChannel | null;
}

const availableChannels = ref<AvailableChannel[]>([]);
const configuredIntegrations = ref<Integration[]>([]);
const selectedChannel = ref<AvailableChannel | null>(null);
const testResult = ref<any>(null);

const form = ref({
  _id: '',
  channelId: '',
  accountId: 'default',
  enabled: true,
  config: {} as Record<string, string>
});

const loading = ref(false);
const syncing = ref(false);
const testing = ref(false);
const error = ref("");
const success = ref("");

function getCapabilityIcon(capability: string): string {
  const icons: Record<string, string> = {
    chat: '💬',
    groups: '👥',
    channels: '📢',
    threads: '🧵',
    media: '🖼️',
    reactions: '😀',
    servers: '🖥️',
    teams: '🏢'
  };
  return icons[capability] || '✓';
}

function isChannelConfigured(channelId: string): boolean {
  return configuredIntegrations.value.some(i => i.channelId === channelId);
}

function isValueMasked(value: string): boolean {
  return value && (value.includes('...') || value === '***');
}

function getPlaceholder(field: ChannelField): string {
  const currentValue = form.value.config[field.key];
  if (isValueMasked(currentValue)) {
    return 'El valor actual está oculto por seguridad';
  }
  return field.hint || '';
}

function selectChannel(channel: AvailableChannel) {
  selectedChannel.value = channel;
  const existing = configuredIntegrations.value.find(i => i.channelId === channel.id);

  if (existing) {
    // Procesar configuración existente
    const cleanConfig: Record<string, string> = {};

    // Primero copiar todos los campos de existing.config
    for (const [key, value] of Object.entries(existing.config)) {
      if (value && typeof value === 'object' && value._masked) {
        // Campo enmascarado: dejar el valor enmascarado para mostrar
        cleanConfig[key] = value.value || '***';
      } else if (typeof value === 'string') {
        cleanConfig[key] = value;
      } else if (value !== null && value !== undefined) {
        cleanConfig[key] = String(value);
      }
    }

    // Asegurar que todos los campos del canal estén en cleanConfig
    for (const field of channel.configFields) {
      if (!(field.key in cleanConfig)) {
        cleanConfig[field.key] = '';
      }
    }

    form.value = {
      _id: existing._id,
      channelId: existing.channelId,
      accountId: existing.accountId,
      enabled: existing.enabled,
      config: cleanConfig
    };
  } else {
    form.value = {
      _id: '',
      channelId: channel.id,
      accountId: 'default',
      enabled: true,
      config: {}
    };
    // Inicializar campos vacíos
    for (const field of channel.configFields) {
      form.value.config[field.key] = '';
    }
  }

  testResult.value = null;
}

function closePanel() {
  selectedChannel.value = null;
  testResult.value = null;
}

async function loadAvailable() {
  try {
    const r = await fetch('/api/integrations/available', {
      headers: api.getHeaders()
    });
    availableChannels.value = await r.json();
  } catch (e) {
    error.value = e instanceof Error ? e.message : "Error al cargar canales";
    setTimeout(() => error.value = "", 5000);
  }
}

async function loadIntegrations() {
  try {
    const r = await fetch('/api/integrations', {
      headers: api.getHeaders()
    });
    configuredIntegrations.value = await r.json();
  } catch (e) {
    error.value = e instanceof Error ? e.message : "Error al cargar integraciones";
    setTimeout(() => error.value = "", 5000);
  }
}

async function saveIntegration() {
  loading.value = true;
  error.value = "";
  success.value = "";

  try {
    const isEdit = form.value._id !== '';
    const url = isEdit ? `/api/integrations/${form.value._id}` : '/api/integrations';
    const method = isEdit ? 'PATCH' : 'POST';

    const r = await fetch(url, {
      method,
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
    success.value = data.message || 'Integración guardada correctamente';
    await loadIntegrations();
    closePanel();
    setTimeout(() => success.value = "", 5000);
  } catch (e) {
    error.value = e instanceof Error ? e.message : "Error al guardar";
    setTimeout(() => error.value = "", 5000);
  } finally {
    loading.value = false;
  }
}

async function testIntegration() {
  testing.value = true;
  testResult.value = null;

  try {
    const r = await fetch(`/api/integrations/${form.value.channelId}/test?accountId=${form.value.accountId}`, {
      method: 'POST',
      headers: api.getHeaders()
    });

    const data = await r.json();
    testResult.value = data;
  } catch (e) {
    testResult.value = {
      success: false,
      message: e instanceof Error ? e.message : "Error al probar conexión"
    };
  } finally {
    testing.value = false;
  }
}

function editIntegration(integration: Integration) {
  const channel = availableChannels.value.find(c => c.id === integration.channelId);
  if (channel) {
    selectChannel(channel);
  }
}

async function deleteIntegration(integration: Integration) {
  if (!confirm(`¿Eliminar la integración de ${integration.channelInfo?.name || integration.channelId}?`)) return;

  try {
    const r = await fetch(`/api/integrations/${integration._id}`, {
      method: 'DELETE',
      headers: api.getHeaders()
    });

    if (!r.ok) throw new Error('Error al eliminar');

    success.value = 'Integración eliminada correctamente';
    await loadIntegrations();
    if (selectedChannel.value?.id === integration.channelId) {
      closePanel();
    }
    setTimeout(() => success.value = "", 5000);
  } catch (e) {
    error.value = e instanceof Error ? e.message : "Error al eliminar";
    setTimeout(() => error.value = "", 5000);
  }
}

async function syncNow() {
  syncing.value = true;
  error.value = "";
  success.value = "";

  try {
    const r = await fetch('/api/integrations/sync', {
      method: 'POST',
      headers: api.getHeaders()
    });

    if (!r.ok) {
      const err = await r.json();
      throw new Error(err.error || 'Error al sincronizar');
    }

    const data = await r.json();
    success.value = `✅ ${data.message} (${data.syncedCount} canales)`;
    setTimeout(() => success.value = "", 5000);
  } catch (e) {
    error.value = e instanceof Error ? e.message : "Error al sincronizar";
    setTimeout(() => error.value = "", 5000);
  } finally {
    syncing.value = false;
  }
}

onMounted(() => {
  loadAvailable();
  loadIntegrations();
});
</script>

<style scoped>
.integrations-page {
  max-width: 1200px;
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
  margin: 0 0 1.5rem 0;
}

.header-actions {
  display: flex;
  gap: 0.75rem;
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

/* Channels Grid */
.channels-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 1rem;
  margin-bottom: 2rem;
}

.channel-card {
  background: #1e293b;
  border: 1px solid #334155;
  border-radius: 8px;
  padding: 1.25rem;
  cursor: pointer;
  transition: all 0.2s;
}

.channel-card:hover {
  border-color: #475569;
  transform: translateY(-2px);
}

.channel-card.active {
  border-color: #3b82f6;
  box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.2);
}

.channel-header {
  display: flex;
  align-items: flex-start;
  gap: 0.75rem;
  margin-bottom: 0.75rem;
}

.channel-icon {
  width: 40px;
  height: 40px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 600;
  font-size: 1.25rem;
  color: white;
  flex-shrink: 0;
}

.channel-info {
  flex: 1;
}

.channel-info h3 {
  margin: 0;
  font-size: 1.125rem;
  font-weight: 600;
}

.channel-info p {
  margin: 0.25rem 0 0 0;
  font-size: 0.875rem;
  color: #94a3b8;
}

.status-badge {
  padding: 0.25rem 0.5rem;
  border-radius: 4px;
  font-size: 0.75rem;
  font-weight: 500;
}

.status-badge.configured {
  background: #065f46;
  color: #6ee7b7;
}

.status-badge.enabled {
  background: #065f46;
  color: #6ee7b7;
}

.channel-capabilities {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.capability-badge {
  padding: 0.25rem 0.5rem;
  background: #334155;
  border-radius: 4px;
  font-size: 0.875rem;
}

/* Config Panel */
.config-panel {
  background: #1e293b;
  border: 1px solid #334155;
  border-radius: 12px;
  overflow: hidden;
  margin-bottom: 2rem;
}

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1.5rem;
  border-bottom: 1px solid #334155;
}

.panel-header h2 {
  margin: 0;
  display: flex;
  align-items: center;
  gap: 0.75rem;
  font-size: 1.25rem;
}

.panel-icon {
  width: 32px;
  height: 32px;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 600;
  color: white;
}

.btn-close {
  background: none;
  border: none;
  color: #94a3b8;
  font-size: 1.5rem;
  cursor: pointer;
  padding: 0;
  width: 2rem;
  height: 2rem;
}

.btn-close:hover {
  color: white;
}

.panel-content {
  padding: 1.5rem;
}

.form {
  display: grid;
  gap: 1.25rem;
}

.form-group {
  display: grid;
  gap: 0.5rem;
}

.input-wrapper {
  position: relative;
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.input-wrapper input {
  flex: 1;
}

.masked-value {
  padding-right: 200px;
  background: #1e293b;
  color: #fbbf24;
}

.masked-badge {
  position: absolute;
  right: 0.5rem;
  font-size: 0.75rem;
  color: #fbbf24;
  white-space: nowrap;
  pointer-events: none;
}

.form-group label {
  font-weight: 500;
  color: #e2e8f0;
}

.form-group label .required {
  color: #f87171;
}

.form-group small {
  color: #94a3b8;
  font-size: 0.875rem;
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

.test-result {
  margin-top: 1.5rem;
  padding: 1rem;
  border-radius: 6px;
  display: flex;
  gap: 0.75rem;
}

.test-result.success {
  background: #065f46;
  color: #6ee7b7;
}

.test-result.error {
  background: #7f1d1d;
  color: #fca5a5;
}

.test-result pre {
  margin: 0.5rem 0 0 0;
  font-size: 0.875rem;
  white-space: pre-wrap;
  word-break: break-word;
}

/* Configured List */
.configured-list {
  background: #1e293b;
  border: 1px solid #334155;
  border-radius: 8px;
  padding: 1.5rem;
}

.configured-list h2 {
  margin: 0 0 1rem 0;
  font-size: 1.25rem;
}

.configured-items {
  display: grid;
  gap: 1rem;
}

.configured-item {
  background: #0f172a;
  border: 1px solid #334155;
  border-radius: 6px;
  padding: 1rem;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.configured-item.disabled {
  opacity: 0.6;
}

.item-header {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-bottom: 0.5rem;
}

.item-icon {
  width: 32px;
  height: 32px;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 600;
  color: white;
}

.item-header h4 {
  margin: 0;
  font-size: 1rem;
}

.item-header small {
  color: #94a3b8;
  font-size: 0.75rem;
}

.item-config {
  display: flex;
  gap: 1rem;
  flex-wrap: wrap;
  font-size: 0.875rem;
  color: #94a3b8;
}

.config-item {
  padding: 0.25rem 0.5rem;
  background: #1e293b;
  border-radius: 4px;
}

.item-actions {
  display: flex;
  gap: 0.5rem;
}

.btn-icon {
  background: none;
  border: none;
  color: #94a3b8;
  cursor: pointer;
  padding: 0.5rem;
  font-size: 1.2rem;
  transition: color 0.2s;
}

.btn-icon:hover {
  color: white;
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
</style>
