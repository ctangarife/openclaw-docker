<template>
  <div class="agent-browser-page">
    <div class="header">
      <h1>Agent Browser Configuration</h1>
      <p class="subtitle">Configure the agent-browser integration for browser automation.</p>
    </div>

    <section class="config-section">
      <div class="section-header">
        <h2>Connection Settings</h2>
        <p class="section-subtitle">Configure how Molbot connects to the agent-browser service.</p>
      </div>

      <form @submit.prevent="save" class="form">
        <div class="form-row">
          <div class="form-group" :class="{ 'col-full': true }">
            <label>Agent Browser URL *</label>
            <input
              v-model="config.AGENT_BROWSER_URL"
              placeholder="http://agent-browser:9222"
              :disabled="loading || saving"
              class="input"
            />
            <small>WebSocket URL or HTTP endpoint of the agent-browser service.</small>
          </div>
        </div>

        <div class="form-row">
          <div class="form-group">
            <label class="toggle-label">
              <input
                type="checkbox"
                v-model="config.enabled"
                :disabled="loading || saving"
              />
              <span>Enable Agent Browser</span>
            </label>
            <small>When disabled, browser automation features will be unavailable.</small>
          </div>
        </div>
      </form>
    </section>

    <section class="config-section">
      <div class="section-header">
        <h2>Session Management</h2>
        <p class="section-subtitle">Control browser session limits and timeouts.</p>
      </div>

      <form @submit.prevent="save" class="form">
        <div class="form-row">
          <div class="form-group">
            <label>
              Max Concurrent Sessions
              <span class="value-display">{{ config.maxConcurrentSessions }}</span>
            </label>
            <input
              type="range"
              :min="1"
              :max="50"
              v-model.number="config.maxConcurrentSessions"
              :disabled="loading || saving"
              class="slider"
            />
            <small>Maximum number of browser sessions running simultaneously.</small>
          </div>

          <div class="form-group">
            <label>Session Timeout (minutes)</label>
            <input
              type="number"
              :min="0"
              v-model.number="config.sessionTimeout"
              :disabled="loading || saving"
              class="input"
            />
            <small>0 = no timeout (sessions run indefinitely).</small>
          </div>
        </div>
      </form>
    </section>

    <section class="config-section">
      <div class="section-header">
        <h2>Screenshot Settings</h2>
        <p class="section-subtitle">Default settings for automatic screenshots.</p>
      </div>

      <form @submit.prevent="save" class="form">
        <div class="form-row">
          <div class="form-group">
            <label class="toggle-label">
              <input
                type="checkbox"
                v-model="config.defaultScreenshot.onNavigation"
                :disabled="loading || saving"
              />
              <span>Capture on Navigation</span>
            </label>
            <small>Automatically take screenshots when navigating to new pages.</small>
          </div>
        </div>

        <div class="form-row">
          <div class="form-group">
            <label>Screenshot Format</label>
            <select
              v-model="config.defaultScreenshot.format"
              :disabled="loading || saving"
              class="input"
            >
              <option value="png">PNG (lossless)</option>
              <option value="jpeg">JPEG (smaller size)</option>
            </select>
            <small>PNG for quality, JPEG for smaller file sizes.</small>
          </div>

          <div class="form-group">
            <label>
              JPEG Quality
              <span class="value-display">{{ config.defaultScreenshot.quality }}%</span>
            </label>
            <input
              type="range"
              :min="1"
              :max="100"
              v-model.number="config.defaultScreenshot.quality"
              :disabled="loading || saving || config.defaultScreenshot.format !== 'jpeg'"
              class="slider"
              :class="{ disabled: config.defaultScreenshot.format !== 'jpeg' }"
            />
            <small>Only applies when using JPEG format.</small>
          </div>
        </div>

        <div class="form-row">
          <div class="form-group">
            <label class="toggle-label">
              <input
                type="checkbox"
                v-model="config.defaultScreenshot.fullPage"
                :disabled="loading || saving"
              />
              <span>Full Page Screenshot</span>
            </label>
            <small>Capture the entire page instead of just the visible viewport.</small>
          </div>
        </div>
      </form>

      <div class="form-actions">
        <button type="submit" class="btn-primary" :disabled="loading || saving">
          <span v-if="saving">Guardando...</span>
          <span v-else>Guardar configuracion</span>
        </button>
        <button
          type="button"
          class="btn-secondary"
          @click="reset"
          :disabled="loading || saving"
        >
          Restablecer valores por defecto
        </button>
      </div>
    </section>

    <!-- Messages -->
    <div v-if="error" class="error-banner">
      <span>⚠️</span>
      <span>{{ error }}</span>
      <button class="btn-close" @click="error = ''">×</button>
    </div>

    <div v-if="saved" class="success-banner">
      <span>✅</span>
      <span>Configuracion guardada correctamente.</span>
      <button class="btn-close" @click="saved = false">×</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from "vue";
import * as api from "../api";

interface ScreenshotSettings {
  onNavigation: boolean;
  format: 'png' | 'jpeg';
  quality: number;
  fullPage: boolean;
}

interface AgentBrowserConfig {
  AGENT_BROWSER_URL: string;
  enabled: boolean;
  maxConcurrentSessions: number;
  sessionTimeout: number;
  defaultScreenshot: ScreenshotSettings;
}

const config = ref<AgentBrowserConfig>({
  AGENT_BROWSER_URL: 'http://agent-browser:9222',
  enabled: true,
  maxConcurrentSessions: 5,
  sessionTimeout: 30,
  defaultScreenshot: {
    onNavigation: true,
    format: 'png',
    quality: 90,
    fullPage: false,
  },
});

const error = ref("");
const saved = ref(false);
const loading = ref(false);
const saving = ref(false);

async function load() {
  loading.value = true;
  try {
    const data = await api.getAgentBrowserConfig();
    config.value = data;
    error.value = "";
  } catch (e) {
    error.value = e instanceof Error ? e.message : "Error al cargar configuracion";
  } finally {
    loading.value = false;
  }
}

async function save() {
  saving.value = true;
  try {
    await api.putAgentBrowserConfig(config.value);
    saved.value = true;
    error.value = "";
    setTimeout(() => (saved.value = false), 3000);
  } catch (e) {
    error.value = e instanceof Error ? e.message : "Error al guardar configuracion";
  } finally {
    saving.value = false;
  }
}

async function reset() {
  if (!confirm("¿Restablecer la configuracion a los valores por defecto?")) return;
  saving.value = true;
  try {
    const data = await api.resetAgentBrowserConfig();
    config.value = data;
    saved.value = true;
    error.value = "";
    setTimeout(() => (saved.value = false), 3000);
  } catch (e) {
    error.value = e instanceof Error ? e.message : "Error al restablecer configuracion";
  } finally {
    saving.value = false;
  }
}

onMounted(() => {
  load();
});
</script>

<style scoped>
.agent-browser-page {
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

.form {
  display: grid;
  gap: 1.25rem;
  padding: 1.5rem;
}

.form-row {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
  gap: 1.5rem;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.form-group.col-full {
  grid-column: 1 / -1;
}

.form-group label {
  font-weight: 500;
  color: #e2e8f0;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.value-display {
  font-weight: 600;
  color: #3b82f6;
  font-size: 0.875rem;
}

.toggle-label {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  cursor: pointer;
  padding: 0.5rem 0;
}

.toggle-label input[type="checkbox"] {
  width: 1.25rem;
  height: 1.25rem;
  cursor: pointer;
}

.toggle-label span {
  font-weight: 500;
  color: #e2e8f0;
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
select:disabled {
  background: #1e293b;
  cursor: not-allowed;
  opacity: 0.5;
}

.slider {
  width: 100%;
  height: 6px;
  border-radius: 3px;
  background: #334155;
  outline: none;
  -webkit-appearance: none;
  cursor: pointer;
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

.slider.disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

small {
  color: #94a3b8;
  font-size: 0.875rem;
}

.form-actions {
  display: flex;
  gap: 0.75rem;
  margin-top: 0.5rem;
  padding: 1.5rem;
  padding-top: 0;
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
