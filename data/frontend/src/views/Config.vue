<template>
  <div class="config-page">
    <div class="header">
      <h1>Configuración</h1>
      <p class="subtitle">Opciones de aplicación. Se persisten en MongoDB y se sincronizan con OpenClaw.</p>
    </div>

    <!-- Rate Limiting Section -->
    <section class="config-section">
      <div class="section-header">
        <h2>⏱️ Rate Limiting (Colas FIFO)</h2>
        <p class="section-subtitle">Controla la concurrencia de peticiones a cada proveedor de LLM para evitar rate limits.</p>
      </div>

      <div class="rate-limiting-controls">
        <!-- Global Toggle -->
        <div class="form-group checkbox-group">
          <label class="toggle-label">
            <input
              type="checkbox"
              v-model="queueConfig.globalEnabled"
              :disabled="loading || savingQueue"
              @change="saveQueueConfig"
            />
            <span>Habilitar Rate Limiting Global</span>
          </label>
          <small>Quando está deshabilitado, las peticiones se envían directamente sin control de concurrencia.</small>
        </div>

        <!-- Provider Limits -->
        <div v-if="queueConfig.globalEnabled" class="providers-grid">
          <div
            v-for="(limit, provider) in queueConfig.providerLimits"
            :key="provider"
            class="provider-card"
            :class="{ 'provider-active': queueStats.queues[provider]?.running > 0 }"
          >
            <div class="provider-header">
              <span class="provider-name">{{ getProviderLabel(provider) }}</span>
              <span class="provider-icon">{{ getProviderIcon(provider) }}</span>
            </div>

            <div class="limit-control">
              <label>
                Concurrencia máxima
                <input
                  type="range"
                  :min="1"
                  :max="50"
                  :value="limit"
                  @input="updateProviderLimit(provider, $event)"
                  :disabled="loading || savingQueue"
                  class="slider"
                />
                <span class="limit-value">{{ limit }}</span>
              </label>
              <small>Peticiones simultáneas máximas</small>
            </div>

            <!-- Live Stats -->
            <div v-if="queueStats.queues[provider]" class="provider-stats">
              <div class="stat">
                <span class="stat-label">Ejecutando:</span>
                <span class="stat-value">{{ queueStats.queues[provider].running }}</span>
              </div>
              <div class="stat">
                <span class="stat-label">En cola:</span>
                <span class="stat-value">{{ queueStats.queues[provider].queued }}</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Retry Settings -->
        <div class="retry-settings">
          <h3>Reintentos y Fallback</h3>

          <div class="form-group checkbox-group">
            <label class="toggle-label">
              <input
                type="checkbox"
                v-model="queueConfig.enableFallback"
                :disabled="loading || savingQueue"
                @change="saveQueueConfig"
              />
              <span>Habilitar Fallback Automático</span>
            </label>
            <small>Si un modelo falla, intenta con uno alternativo (ej: Sonnet → Haiku)</small>
          </div>

          <div class="form-group">
            <label>
              Máximo de reintentos
              <input
                type="number"
                :min="0"
                :max="10"
                v-model.number="queueConfig.maxRetries"
                @change="saveQueueConfig"
                :disabled="loading || savingQueue"
                class="input"
              />
            </label>
            <small>Reintentos con backoff exponencial antes de usar fallback</small>
          </div>
        </div>
      </div>

      <!-- Queue Stats Summary -->
      <div v-if="queueStats.summary" class="stats-summary">
        <div class="stat-card">
          <span class="stat-icon">🔄</span>
          <div class="stat-info">
            <span class="stat-label">Ejecutando</span>
            <span class="stat-value">{{ queueStats.summary.totalRunning }}</span>
          </div>
        </div>
        <div class="stat-card">
          <span class="stat-icon">⏳</span>
          <div class="stat-info">
            <span class="stat-label">En cola</span>
            <span class="stat-value">{{ queueStats.summary.totalQueued }}</span>
          </div>
        </div>
        <div class="stat-card">
          <span class="stat-icon">📊</span>
          <div class="stat-info">
            <span class="stat-label">Providers</span>
            <span class="stat-value">{{ queueStats.summary.totalProviders }}</span>
          </div>
        </div>
      </div>
    </section>

    <!-- Model Configuration Section -->
    <section class="config-section">
      <div class="section-header">
        <h2>🤖 Configuración de Modelos</h2>
        <p class="section-subtitle">Define el modelo principal y hasta 2 modelos de soporte como fallback.</p>
      </div>

      <form @submit.prevent="save" class="form">
        <!-- Fallback Chain Visualization -->
        <div class="fallback-chain">
          <div class="chain-step">
            <div class="step-number">1</div>
            <div class="step-content">
              <label class="step-label">Modelo Principal *</label>
              <select
                v-model="config.defaultAgentModel"
                required
                class="input"
                :disabled="loading"
              >
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
          </div>

          <div class="chain-arrow">↓</div>

          <div class="chain-step" :class="{ 'step-disabled': !config.fallbackModel1 }">
            <div class="step-number">2</div>
            <div class="step-content">
              <label class="step-label">Modelo de Soporte 1 <span class="optional">(opcional)</span></label>
              <select
                v-model="config.fallbackModel1"
                class="input"
                :disabled="loading"
              >
                <option value="">Sin soporte 1</option>
                <optgroup
                  v-for="(models, provider) in availableModels"
                  :key="provider"
                  :label="getProviderLabel(provider)"
                >
                  <option
                    v-for="model in models"
                    :key="model.id"
                    :value="model.id"
                    :disabled="model.id === config.defaultAgentModel"
                  >
                    {{ model.name }}
                  </option>
                </optgroup>
              </select>
            </div>
          </div>

          <div class="chain-arrow">↓</div>

          <div class="chain-step" :class="{ 'step-disabled': !config.fallbackModel2 }">
            <div class="step-number">3</div>
            <div class="step-content">
              <label class="step-label">Modelo de Soporte 2 <span class="optional">(opcional)</span></label>
              <select
                v-model="config.fallbackModel2"
                class="input"
                :disabled="loading"
              >
                <option value="">Sin soporte 2</option>
                <optgroup
                  v-for="(models, provider) in availableModels"
                  :key="provider"
                  :label="getProviderLabel(provider)"
                >
                  <option
                    v-for="model in models"
                    :key="model.id"
                    :value="model.id"
                    :disabled="model.id === config.defaultAgentModel || model.id === config.fallbackModel1"
                  >
                    {{ model.name }}
                  </option>
                </optgroup>
              </select>
            </div>
          </div>
        </div>

        <p class="chain-help-text">
          <span class="info-icon">ℹ️</span>
          Si el modelo principal falla después de los reintentos, el sistema intentará automáticamente con el Soporte 1, y luego con el Soporte 2.
        </p>

        <div class="form-group">
          <label>
            Workspace path
            <input
              v-model="config.workspacePath"
              placeholder="ej. /app/workspace"
              :disabled="loading"
              class="input"
            />
          </label>
        </div>

        <div class="form-actions">
          <button type="submit" class="btn-primary" :disabled="loading || saving">
            <span v-if="saving">Guardando...</span>
            <span v-else">💾 Guardar configuración</span>
          </button>
          <button
            type="button"
            class="btn-secondary"
            @click="syncNow"
            :disabled="syncing || loading"
          >
            <span v-if="syncing">🔄 Sincronizando...</span>
            <span v-else>🔄 Sincronizar con OpenClaw</span>
          </button>
        </div>
      </form>
    </section>

    <!-- Messages -->
    <div v-if="error" class="error-banner">
      <span>⚠️</span>
      <span>{{ error }}</span>
      <button class="btn-close" @click="error = ''">×</button>
    </div>

    <div v-if="saved" class="success-banner">
      <span>✅</span>
      <span>Configuración guardada y sincronizada.</span>
      <button class="btn-close" @click="saved = false">×</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from "vue";
import * as api from "../api";

const config = ref<Record<string, string>>({
  defaultAgentModel: "",
  fallbackModel1: "",
  fallbackModel2: "",
  workspacePath: ""
});
const availableModels = ref<Record<string, Array<{ id: string; name: string }>>>({});
const error = ref("");
const saved = ref(false);
const loading = ref(false);
const saving = ref(false);
const syncing = ref(false);

// Queue config
const queueConfig = ref<{
  providerLimits: Record<string, number>;
  globalEnabled: boolean;
  maxRetries: number;
  enableFallback: boolean;
}>({
  providerLimits: {},
  globalEnabled: true,
  maxRetries: 3,
  enableFallback: true
});
const queueStats = ref<{
  queues: Record<string, { running: number; queued: number; limit: number }>;
  summary: { totalProviders: number; totalRunning: number; totalQueued: number };
}>({ queues: {}, summary: { totalProviders: 0, totalRunning: 0, totalQueued: 0 } });
const savingQueue = ref(false);
let statsInterval: number | null = null;

// Mapeo de nombres de provider a etiquetas legibles
const providerLabels: Record<string, string> = {
  'minimax': 'MiniMax',
  'openai': 'OpenAI',
  'anthropic': 'Anthropic',
  'google': 'Google Gemini',
  'moonshot': 'Moonshot/Kimi',
  'groq': 'Groq',
  'xai': 'xAI/Grok',
  'cerebras': 'Cerebras',
  'mistral': 'Mistral',
  'deepseek': 'DeepSeek',
  'openrouter': 'OpenRouter',
  'ollama': 'Ollama (Local)',
  'opencode': 'OpenCode',
  'vercel-ai-gateway': 'Vercel AI Gateway',
  'zai': 'Z.AI/GLM'
};

const providerIcons: Record<string, string> = {
  'anthropic': '🧠',
  'openai': '🤖',
  'minimax': '⚡',
  'groq': '🚀',
  'openrouter': '🔀',
  'google': '🔍',
  'mistral': '🌀'
};

function getProviderLabel(provider: string): string {
  return providerLabels[provider] || provider.charAt(0).toUpperCase() + provider.slice(1);
}

function getProviderIcon(provider: string): string {
  return providerIcons[provider] || '📦';
}

async function load() {
  loading.value = true;
  try {
    const [configData, models] = await Promise.all([
      api.getConfig(),
      api.getAvailableModels()
    ]);

    availableModels.value = models;
    config.value = {
      defaultAgentModel: configData.defaultAgentModel ?? "",
      fallbackModel1: configData.fallbackModel1 ?? "",
      fallbackModel2: configData.fallbackModel2 ?? "",
      workspacePath: configData.workspacePath ?? "",
    };
    error.value = "";
  } catch (e) {
    error.value = e instanceof Error ? e.message : "Error al cargar";
  } finally {
    loading.value = false;
  }
}

async function loadQueueConfig() {
  try {
    const data = await api.getQueueConfig();
    queueConfig.value = {
      providerLimits: data.config.providerLimits,
      globalEnabled: data.config.globalEnabled,
      maxRetries: data.config.maxRetries,
      enableFallback: data.config.enableFallback
    };
  } catch (e) {
    console.error('Error cargando configuración de colas:', e);
  }
}

async function loadQueueStats() {
  try {
    const data = await api.getQueueStats();
    queueStats.value = {
      queues: data.queues,
      summary: data.summary
    };
  } catch (e) {
    console.error('Error cargando estadísticas de colas:', e);
  }
}

async function saveQueueConfig() {
  savingQueue.value = true;
  try {
    await api.saveQueueConfig(queueConfig.value);
    error.value = "";
  } catch (e) {
    error.value = e instanceof Error ? e.message : "Error al guardar configuración de colas";
  } finally {
    savingQueue.value = false;
  }
}

function updateProviderLimit(provider: string, event: Event) {
  const target = event.target as HTMLInputElement;
  const value = parseInt(target.value);
  queueConfig.value.providerLimits[provider] = value;
  // Debounce save
  setTimeout(() => saveQueueConfig(), 500);
}

async function syncNow() {
  syncing.value = true;
  try {
    await api.syncCredentials();
    error.value = "";
    setTimeout(() => {
      load();
    }, 500);
  } catch (e) {
    error.value = e instanceof Error ? e.message : "Error al sincronizar";
  } finally {
    syncing.value = false;
  }
}

async function save() {
  saving.value = true;
  try {
    await api.putConfig({
      defaultAgentModel: config.value.defaultAgentModel,
      fallbackModel1: config.value.fallbackModel1 || null,
      fallbackModel2: config.value.fallbackModel2 || null,
      workspacePath: config.value.workspacePath,
    });

    await api.syncCredentials();

    saved.value = true;
    error.value = "";
    setTimeout(() => (saved.value = false), 3000);
  } catch (e) {
    error.value = e instanceof Error ? e.message : "Error al guardar";
  } finally {
    saving.value = false;
  }
}

onMounted(async () => {
  await load();
  await loadQueueConfig();
  await loadQueueStats();

  // Actualizar estadísticas cada 5 segundos
  statsInterval = window.setInterval(loadQueueStats, 5000);
});

onUnmounted(() => {
  if (statsInterval) {
    clearInterval(statsInterval);
  }
});
</script>

<style scoped>
.config-page {
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

.config-section {
  background: #1e293b;
  border: 1px solid #334155;
  border-radius: 12px;
  margin-bottom: 2rem;
  overflow: hidden;
}

.section-header {
  padding: 1.5rem 1.5rem 0;
  border-bottom: 1px solid #334155;
}

.section-header h2 {
  margin: 0 0 0.5rem 0;
  font-size: 1.25rem;
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.section-subtitle {
  color: #94a3b8;
  font-size: 0.875rem;
  margin: 0;
}

/* Rate Limiting Controls */
.rate-limiting-controls {
  padding: 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 2rem;
}

.checkbox-group {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  cursor: pointer;
}

.checkbox-group label {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-weight: 500;
  color: #e2e8f0;
  cursor: pointer;
}

.checkbox-group input[type="checkbox"] {
  width: 1.25rem;
  height: 1.25rem;
  cursor: pointer;
}

.checkbox-group small {
  color: #94a3b8;
  font-size: 0.875rem;
}

.providers-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 1rem;
}

.provider-card {
  background: #0f172a;
  border: 1px solid #334155;
  border-radius: 8px;
  padding: 1.25rem;
  transition: all 0.2s;
}

.provider-card:hover {
  border-color: #475569;
  transform: translateY(-2px);
}

.provider-active {
  border-color: #3b82f6;
  box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.2);
}

.provider-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1rem;
}

.provider-name {
  font-weight: 600;
  color: #e2e8f0;
  font-size: 1rem;
}

.provider-icon {
  font-size: 1.5rem;
}

.limit-control {
  margin-bottom: 1rem;
}

.limit-control label {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  font-weight: 500;
  color: #e2e8f0;
}

.limit-control small {
  color: #94a3b8;
  font-size: 0.875rem;
}

.slider {
  width: 100%;
  height: 6px;
  border-radius: 3px;
  background: #334155;
  outline: none;
  -webkit-appearance: none;
}

.slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: #3b82f6;
  cursor: pointer;
}

.slider::-moz-range-thumb {
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: #3b82f6;
  cursor: pointer;
  border: none;
}

.limit-value {
  font-weight: 600;
  color: #3b82f6;
  text-align: center;
  font-size: 1.25rem;
}

.provider-stats {
  display: flex;
  gap: 1rem;
  padding-top: 0.75rem;
  border-top: 1px solid #334155;
}

.provider-stats .stat {
  display: flex;
  flex-direction: column;
  align-items: center;
}

.provider-stats .stat-label {
  font-size: 0.75rem;
  color: #94a3b8;
}

.provider-stats .stat-value {
  font-weight: 600;
  color: #e2e8f0;
}

/* Retry Settings */
.retry-settings {
  background: #0f172a;
  border: 1px solid #334155;
  border-radius: 8px;
  padding: 1.25rem;
}

.retry-settings h3 {
  margin: 0 0 1rem 0;
  font-size: 1rem;
  color: #e2e8f0;
}

/* Stats Summary */
.stats-summary {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 1rem;
  padding: 0 1.5rem 1.5rem 1.5rem;
}

.stat-card {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 1rem;
  background: #0f172a;
  border: 1px solid #334155;
  border-radius: 6px;
}

.stat-icon {
  font-size: 1.5rem;
}

.stat-info {
  display: flex;
  flex-direction: column;
}

.stat-info .stat-label {
  font-size: 0.75rem;
  color: #94a3b8;
}

.stat-info .stat-value {
  font-size: 1.5rem;
  font-weight: 700;
  color: #e2e8f0;
}

/* Config Form */
.form {
  display: grid;
  gap: 1.25rem;
  padding: 1.5rem;
}

.form-group {
  display: grid;
  gap: 0.5rem;
}

.form-group label {
  font-weight: 500;
  color: #e2e8f0;
}

/* Fallback Chain */
.fallback-chain {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1rem;
  padding: 1.5rem;
  background: #0f172a;
  border: 1px solid #334155;
  border-radius: 8px;
}

.chain-step {
  display: flex;
  align-items: flex-start;
  gap: 1rem;
  width: 100%;
  max-width: 600px;
  padding: 1rem;
  background: #1e293b;
  border: 2px solid #3b82f6;
  border-radius: 8px;
  transition: all 0.2s;
}

.chain-step.step-disabled {
  border-color: #334155;
  opacity: 0.7;
}

.step-number {
  flex-shrink: 0;
  width: 2.5rem;
  height: 2.5rem;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #3b82f6;
  color: white;
  border-radius: 50%;
  font-weight: 700;
  font-size: 1.125rem;
}

.chain-step.step-disabled .step-number {
  background: #334155;
}

.step-content {
  flex: 1;
  min-width: 0;
}

.step-label {
  font-weight: 600;
  color: #e2e8f0;
  margin-bottom: 0.5rem;
  display: block;
}

.step-label .optional {
  font-weight: 400;
  color: #94a3b8;
  font-size: 0.875rem;
}

.chain-arrow {
  font-size: 1.5rem;
  color: #3b82f6;
  line-height: 1;
}

.chain-help-text {
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
  padding: 0.75rem 1rem;
  background: #1e3a5f;
  border: 1px solid #3b82f6;
  border-radius: 6px;
  color: #bfdbfe;
  font-size: 0.875rem;
  line-height: 1.5;
}

.info-icon {
  flex-shrink: 0;
  font-size: 1rem;
}

.input,
select {
  padding: 0.75rem;
  background: #0f172a;
  border: 1px solid #334155;
  border-radius: 6px;
  color: white;
  font-size: 1rem;
  transition: border-color 0.2s;
  width: 100%;
}

.input:focus,
select:focus {
  outline: none;
  border-color: #3b82f6;
}

.input:disabled,
.select:disabled {
  background: #1e293b;
  cursor: not-allowed;
  opacity: 0.5;
}

small {
  color: #94a3b8;
  font-size: 0.875rem;
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
  font-size: 1.5rem;
  cursor: pointer;
  padding: 0;
  width: 2rem;
  height: 2rem;
  display: flex;
  align-items: center;
  justify-content: center;
}

.btn-close:hover {
  opacity: 0.7;
}
</style>
