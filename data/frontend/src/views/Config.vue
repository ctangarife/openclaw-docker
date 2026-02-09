<template>
  <div class="config-page">
    <div class="header">
      <h1>Configuración</h1>
      <p class="subtitle">Opciones de aplicación. Se persisten en MongoDB y se sincronizan con OpenClaw.</p>
    </div>

    <form @submit.prevent="save" class="config-form">
      <div class="form-group">
        <label>
          Modelo por defecto del agente *
          <select 
            v-model="config.defaultAgentModel" 
            required
            class="select-model"
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
          <small class="help-text">
            Solo se muestran modelos con credenciales habilitadas. 
            Si cambias el modelo, se sincronizará automáticamente con OpenClaw.
          </small>
        </label>
      </div>

      <div class="form-group">
        <label>
          Workspace path
          <input 
            v-model="config.workspacePath" 
            placeholder="ej. /app/workspace" 
            :disabled="loading"
          />
        </label>
      </div>

      <div class="form-actions">
        <button type="submit" class="btn-primary" :disabled="loading || saving">
          <span v-if="saving">Guardando...</span>
          <span v-else>Guardar configuración</span>
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

    <div v-if="error" class="error-message">{{ error }}</div>
    <div v-if="saved" class="success-message">✅ Configuración guardada y sincronizada.</div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from "vue";
import * as api from "../api";

const config = ref<Record<string, string>>({ 
  defaultAgentModel: "", 
  workspacePath: "" 
});
const availableModels = ref<Record<string, Array<{ id: string; name: string }>>>({});
const error = ref("");
const saved = ref(false);
const loading = ref(false);
const saving = ref(false);
const syncing = ref(false);

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

function getProviderLabel(provider: string): string {
  return providerLabels[provider] || provider.charAt(0).toUpperCase() + provider.slice(1);
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
      workspacePath: configData.workspacePath ?? "",
    };
    error.value = "";
  } catch (e) {
    error.value = e instanceof Error ? e.message : "Error al cargar";
  } finally {
    loading.value = false;
  }
}

async function syncNow() {
  syncing.value = true;
  try {
    await api.syncCredentials();
    error.value = "";
    // Recargar después de sincronizar
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
      workspacePath: config.value.workspacePath,
    });
    
    // Sincronizar con OpenClaw después de guardar
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

onMounted(() => {
  load();
});
</script>

<style scoped>
.config-page {
  max-width: 600px;
  margin: 0 auto;
  padding: 2rem;
}

.header {
  margin-bottom: 2rem;
}

.header h1 {
  margin: 0 0 0.5rem 0;
  font-size: 2rem;
}

.subtitle {
  color: #6b7280;
  margin: 0;
}

.config-form {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
  margin-top: 1.5rem;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.form-group label {
  font-weight: 500;
  color: #374151;
}

.select-model,
.form-group input {
  padding: 0.75rem;
  border: 1px solid #d1d5db;
  border-radius: 0.375rem;
  font-size: 1rem;
  transition: border-color 0.2s;
}

.select-model:focus,
.form-group input:focus {
  outline: none;
  border-color: #3b82f6;
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
}

.select-model:disabled,
.form-group input:disabled {
  background-color: #f3f4f6;
  cursor: not-allowed;
}

.help-text {
  color: #6b7280;
  font-size: 0.875rem;
  margin-top: 0.25rem;
}

.form-actions {
  display: flex;
  gap: 1rem;
  margin-top: 1rem;
}

.btn-primary,
.btn-secondary {
  padding: 0.75rem 1.5rem;
  border-radius: 0.375rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
  border: none;
}

.btn-primary {
  background-color: #3b82f6;
  color: white;
}

.btn-primary:hover:not(:disabled) {
  background-color: #2563eb;
}

.btn-secondary {
  background-color: #f3f4f6;
  color: #374151;
}

.btn-secondary:hover:not(:disabled) {
  background-color: #e5e7eb;
}

.btn-primary:disabled,
.btn-secondary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.error-message {
  margin-top: 1rem;
  padding: 0.75rem;
  background-color: #fef2f2;
  border: 1px solid #fecaca;
  border-radius: 0.375rem;
  color: #dc2626;
}

.success-message {
  margin-top: 1rem;
  padding: 0.75rem;
  background-color: #f0fdf4;
  border: 1px solid #bbf7d0;
  border-radius: 0.375rem;
  color: #16a34a;
}
</style>
