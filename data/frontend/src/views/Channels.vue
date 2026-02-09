<template>
  <div class="channels-page">
    <div class="header">
      <h1>Canales / Workflows</h1>
      <p class="subtitle">Configura los canales de OpenClaw. Se sincronizan automáticamente.</p>
      <div class="header-actions">
        <button
          class="btn-secondary"
          @click="importDefaults"
          title="Importar canales por defecto de OpenClaw"
        >
          <span>📥</span> Importar por defecto
        </button>
        <button
          class="btn-secondary"
          @click="syncNow"
          :disabled="syncing"
          title="Sincronizar con OpenClaw"
        >
          <span v-if="syncing">🔄</span>
          <span v-else>🔄</span>
          {{ syncing ? 'Sincronizando...' : 'Sincronizar' }}
        </button>
        <button class="btn-primary" @click="showForm = true">
          <span>+</span> Nuevo canal
        </button>
      </div>
    </div>

    <!-- Formulario modal -->
    <div v-if="showForm" class="modal-overlay" @click.self="cancelForm">
      <div class="modal-card">
        <div class="modal-header">
          <h2>{{ editingId ? 'Editar' : 'Nuevo' }} canal</h2>
          <button class="btn-close" @click="cancelForm">×</button>
        </div>

        <form @submit.prevent="saveChannel" class="form">
          <div class="form-group">
            <label>ID del canal *</label>
            <input
              v-model="form.id"
              :disabled="!!editingId"
              placeholder="ej: code, chat, default"
              required
              class="input"
            />
            <small>Identificador único del canal (solo letras, números, guiones)</small>
          </div>

          <div class="form-group">
            <label>Nombre *</label>
            <input
              v-model="form.name"
              placeholder="ej: Code, Chat, Default"
              required
              class="input"
            />
          </div>

          <div class="form-group">
            <label>Descripción</label>
            <input
              v-model="form.description"
              placeholder="Descripción del canal"
              class="input"
            />
          </div>

          <div class="form-group">
            <label>Modelo *</label>
            <select v-model="form.config.model" required class="select">
              <option value="">Selecciona un modelo</option>
              <optgroup
                v-for="(models, provider) in availableModels"
                :key="provider"
                :label="getProviderLabel(provider)"
              >
                <option
                  v-for="model in models"
                  :key="model.id"
                  :value="model.id"
                >
                  {{ model.name }}
                </option>
              </optgroup>
            </select>
          </div>

          <div class="form-group">
            <label>System Prompt</label>
            <textarea
              v-model="form.config.systemPrompt"
              placeholder="Instrucciones del sistema para este canal..."
              rows="4"
              class="textarea"
            ></textarea>
          </div>

          <div class="form-group">
            <label>Orden</label>
            <input
              v-model.number="form.order"
              type="number"
              placeholder="0"
              class="input"
            />
            <small>Menor número aparece primero</small>
          </div>

          <div class="form-group checkbox-group">
            <label>
              <input type="checkbox" v-model="form.enabled" />
              Canal habilitado
            </label>
          </div>

          <div class="form-actions">
            <button type="button" class="btn-secondary" @click="cancelForm">Cancelar</button>
            <button type="submit" class="btn-primary">Guardar</button>
          </div>
        </form>
      </div>
    </div>

    <!-- Lista de canales -->
    <div v-if="list.length" class="channels-list">
      <div
        v-for="channel in sortedChannels"
        :key="channel.id"
        class="channel-card"
        :class="{ disabled: !channel.enabled }"
      >
        <div class="channel-info">
          <div class="channel-header">
            <h3>{{ channel.name }}</h3>
            <span class="channel-id">{{ channel.id }}</span>
          </div>
          <p v-if="channel.description" class="channel-description">{{ channel.description }}</p>
          <div class="channel-model">
            <span class="label">Modelo:</span>
            <span class="value">{{ getModelName(channel.config?.model) }}</span>
          </div>
          <div v-if="channel.config?.systemPrompt" class="channel-prompt">
            <span class="label">Prompt:</span>
            <span class="value">{{ truncate(channel.config.systemPrompt, 100) }}</span>
          </div>
        </div>
        <div class="channel-actions">
          <label class="toggle-switch">
            <input
              type="checkbox"
              :checked="channel.enabled"
              @change="toggle(channel)"
            />
            <span class="toggle-slider"></span>
          </label>
          <button class="btn-icon" @click="edit(channel)" title="Editar">✏️</button>
          <button class="btn-icon btn-danger" @click="remove(channel)" title="Eliminar">🗑️</button>
        </div>
      </div>
    </div>

    <div v-else class="empty-state">
      <p>No hay canales configurados.</p>
      <p class="empty-hint">Importa los canales por defecto o crea uno nuevo.</p>
    </div>

    <!-- Messages -->
    <div v-if="error" class="error-banner">
      <span>⚠️</span>
      <span>{{ error }}</span>
      <button class="btn-close" @click="error = ''">×</button>
    </div>

    <div v-if="syncMessage" class="success-banner">
      <span>✅</span>
      <span>{{ syncMessage }}</span>
      <button class="btn-close" @click="syncMessage = ''">×</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from "vue";
import * as api from "../api";

interface Channel {
  _id: string;
  id: string;
  name: string;
  description: string;
  config: {
    model?: string;
    systemPrompt?: string;
  };
  enabled: boolean;
  order: number;
}

const list = ref<Channel[]>([]);
const availableModels = ref<Record<string, Array<{ id: string; name: string }>>>({});
const error = ref("");
const syncMessage = ref("");
const syncing = ref(false);
const showForm = ref(false);
const editingId = ref<string | null>(null);

const form = ref({
  id: "",
  name: "",
  description: "",
  config: {
    model: "",
    systemPrompt: ""
  },
  order: 0,
  enabled: true
});

const providerLabels: Record<string, string> = {
  'anthropic': 'Anthropic',
  'openai': 'OpenAI',
  'google': 'Google',
  'groq': 'Groq',
  'xai': 'xAI',
  'ollama': 'Ollama',
  'zai': 'Z.AI',
  'mistral': 'Mistral',
  'deepseek': 'DeepSeek'
};

function getProviderLabel(provider: string): string {
  return providerLabels[provider] || provider;
}

function getModelName(modelId: string): string {
  if (!modelId) return 'No configurado';
  // Buscar en availableModels
  for (const [provider, models] of Object.entries(availableModels.value)) {
    const found = models.find(m => m.id === modelId);
    if (found) return found.name;
  }
  return modelId;
}

function truncate(text: string, maxLength: number): string {
  if (!text) return '';
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength) + '...';
}

const sortedChannels = computed(() => {
  return [...list.value].sort((a, b) => a.order - b.order);
});

async function load() {
  try {
    const [channels, models] = await Promise.all([
      fetch('/api/channels', { headers: api.getHeaders() }).then(r => r.json()),
      api.getAvailableModels()
    ]);
    list.value = channels;
    availableModels.value = models;
    error.value = "";
  } catch (e) {
    error.value = e instanceof Error ? e.message : "Error al cargar";
  }
}

async function importDefaults() {
  if (!confirm('¿Importar canales por defecto de OpenClaw? Esto puede sobrescribir canales existentes.')) return;

  try {
    syncing.value = true;
    const r = await fetch('/api/channels/import-default', {
      method: 'POST',
      headers: api.getHeaders()
    });
    if (!r.ok) throw new Error(await r.text());
    const result = await r.json();
    syncMessage.value = result.message;
    await load();
    setTimeout(() => syncMessage.value = '', 5000);
  } catch (e) {
    error.value = e instanceof Error ? e.message : "Error al importar";
  } finally {
    syncing.value = false;
  }
}

async function syncNow() {
  syncing.value = true;
  syncMessage.value = "";
  error.value = "";
  try {
    const r = await fetch('/api/channels/sync', {
      method: 'POST',
      headers: api.getHeaders()
    });
    if (!r.ok) throw new Error(await r.text());
    const result = await r.json();
    syncMessage.value = `✅ ${result.channelsCount} canales sincronizados`;
    setTimeout(() => syncMessage.value = '', 5000);
  } catch (e) {
    error.value = e instanceof Error ? e.message : "Error al sincronizar";
  } finally {
    syncing.value = false;
  }
}

function cancelForm() {
  showForm.value = false;
  editingId.value = null;
  form.value = {
    id: "",
    name: "",
    description: "",
    config: { model: "", systemPrompt: "" },
    order: 0,
    enabled: true
  };
}

function edit(channel: Channel) {
  editingId.value = channel._id;
  form.value = {
    id: channel.id,
    name: channel.name,
    description: channel.description,
    config: {
      model: channel.config?.model || "",
      systemPrompt: channel.config?.systemPrompt || ""
    },
    order: channel.order,
    enabled: channel.enabled
  };
  showForm.value = true;
}

async function saveChannel() {
  try {
    const method = editingId.value ? 'PATCH' : 'POST';
    const url = editingId.value ? `/api/channels/${editingId.value}` : '/api/channels';

    const r = await fetch(url, {
      method,
      headers: api.getHeaders(),
      body: JSON.stringify(form.value)
    });

    if (!r.ok) throw new Error(await r.text());

    cancelForm();
    await load();
  } catch (e) {
    error.value = e instanceof Error ? e.message : "Error al guardar";
  }
}

async function toggle(channel: Channel) {
  try {
    await fetch(`/api/channels/${channel._id}`, {
      method: 'PATCH',
      headers: api.getHeaders(),
      body: JSON.stringify({ enabled: !channel.enabled })
    });
    await load();
  } catch (e) {
    error.value = e instanceof Error ? e.message : "Error al actualizar";
  }
}

async function remove(channel: Channel) {
  if (!confirm(`¿Eliminar el canal "${channel.name}"?`)) return;
  try {
    await fetch(`/api/channels/${channel._id}`, {
      method: 'DELETE',
      headers: api.getHeaders()
    });
    await load();
  } catch (e) {
    error.value = e instanceof Error ? e.message : "Error al eliminar";
  }
}

onMounted(() => {
  load();
});
</script>

<style scoped>
.channels-page {
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
  margin: 0 0 1.5rem 0;
}

.header-actions {
  display: flex;
  gap: 0.75rem;
  flex-wrap: wrap;
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

.btn-secondary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* Modal */
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
  padding: 1rem;
}

.modal-card {
  background: #1e293b;
  border-radius: 12px;
  width: 100%;
  max-width: 600px;
  max-height: 90vh;
  overflow-y: auto;
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1.5rem;
  border-bottom: 1px solid #334155;
}

.modal-header h2 {
  margin: 0;
  font-size: 1.5rem;
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

.form {
  padding: 1.5rem;
}

.form-group {
  margin-bottom: 1.25rem;
}

.form-group label {
  display: block;
  margin-bottom: 0.5rem;
  font-weight: 500;
  color: #e2e8f0;
}

.form-group small {
  display: block;
  margin-top: 0.25rem;
  color: #94a3b8;
  font-size: 0.875rem;
}

.input,
.select,
.textarea {
  width: 100%;
  padding: 0.75rem;
  background: #0f172a;
  border: 1px solid #334155;
  border-radius: 6px;
  color: white;
  font-size: 1rem;
  transition: border-color 0.2s;
}

.input:focus,
.select:focus,
.textarea:focus {
  outline: none;
  border-color: #3b82f6;
}

.textarea {
  font-family: inherit;
  resize: vertical;
  min-height: 100px;
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
  justify-content: flex-end;
  margin-top: 2rem;
  padding-top: 1.5rem;
  border-top: 1px solid #334155;
}

/* Channels List */
.channels-list {
  display: grid;
  gap: 1rem;
}

.channel-card {
  background: #1e293b;
  border: 1px solid #334155;
  border-radius: 8px;
  padding: 1.5rem;
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  transition: border-color 0.2s;
}

.channel-card:hover {
  border-color: #475569;
}

.channel-card.disabled {
  opacity: 0.6;
}

.channel-info {
  flex: 1;
}

.channel-header {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-bottom: 0.5rem;
}

.channel-header h3 {
  margin: 0;
  font-size: 1.125rem;
  font-weight: 600;
}

.channel-id {
  padding: 0.25rem 0.5rem;
  background: #334155;
  border-radius: 4px;
  font-size: 0.75rem;
  font-family: monospace;
  color: #94a3b8;
}

.channel-description {
  color: #94a3b8;
  margin: 0 0 0.75rem 0;
}

.channel-model,
.channel-prompt {
  display: flex;
  gap: 0.5rem;
  font-size: 0.875rem;
  margin-top: 0.5rem;
}

.channel-model .label,
.channel-prompt .label {
  color: #94a3b8;
  font-weight: 500;
}

.channel-model .value,
.channel-prompt .value {
  color: #e2e8f0;
}

.channel-actions {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

/* Toggle */
.toggle-switch {
  display: flex;
  align-items: center;
}

.toggle-switch input {
  display: none;
}

.toggle-slider {
  position: relative;
  width: 44px;
  height: 24px;
  background: #334155;
  border-radius: 12px;
  transition: background 0.2s;
}

.toggle-slider::before {
  content: "";
  position: absolute;
  width: 18px;
  height: 18px;
  left: 3px;
  top: 3px;
  background: white;
  border-radius: 50%;
  transition: transform 0.2s;
}

.toggle-switch input:checked + .toggle-slider {
  background: #3b82f6;
}

.toggle-switch input:checked + .toggle-slider::before {
  transform: translateX(20px);
}

/* Buttons */
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

.btn-icon.btn-danger:hover {
  color: #f87171;
}

/* Empty state */
.empty-state {
  text-align: center;
  padding: 3rem 1rem;
  color: #94a3b8;
}

.empty-hint {
  font-size: 0.875rem;
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
