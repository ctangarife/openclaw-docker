<template>
  <div class="agents-page">
    <div class="header">
      <h1>OpenClaw Agents</h1>
      <p class="subtitle">Gestiona los agentes de OpenClaw. Cada agente tiene su propio "cerebro" con workspace, sesiones y credenciales aisladas.</p>
      <div class="header-actions">
        <button class="btn-primary" @click="showForm = true">
          <span>+</span> Agregar agente
        </button>
      </div>
    </div>

    <!-- Formulario modal -->
    <div v-if="showForm" class="modal-overlay" @click.self="cancelForm">
      <div class="modal-card">
        <div class="modal-header">
          <h2>Nuevo agente</h2>
          <button class="btn-close" @click="cancelForm">×</button>
        </div>

        <form @submit.prevent="saveAgent" class="form">
          <div class="form-group">
            <label>ID del agente *</label>
            <input
              v-model="form.id"
              placeholder="ej: work, family, coding"
              required
              pattern="[a-z0-9-]+"
              class="input"
            />
            <p class="help-text">Solo letras minúsculas, números y guiones. Ej: work, family, coding</p>
          </div>

          <div class="form-group">
            <label>Nombre (opcional)</label>
            <input
              v-model="form.name"
              placeholder="Nombre descriptivo"
              class="input"
            />
          </div>

          <div class="form-group">
            <label>Workspace (opcional)</label>
            <input
              v-model="form.workspace"
              placeholder="workspace-{id}"
              class="input"
            />
            <p class="help-text">Se creará dentro de ~/.openclaw/</p>
          </div>

          <div class="form-group">
            <label>
              Modelo (opcional)
              <button
                type="button"
                class="btn-toggle-mode"
                @click="useManualModel = !useManualModel"
              >
                {{ useManualModel ? '📋 Seleccionar de lista' : '✏️ Ingresar manualmente' }}
              </button>
            </label>

            <!-- Select con modelos principales -->
            <select v-if="!useManualModel" v-model="form.model" class="input">
              <option value="">Usar modelo por defecto</option>
              <optgroup
                v-for="group in mainModels"
                :key="group.provider"
                :label="getProviderLabel(group.provider)"
              >
                <option
                  v-for="model in group.models"
                  :key="model.id"
                  :value="model.id"
                >
                  {{ model.name }}
                </option>
              </optgroup>
              <option v-if="mainModels.length === 0" value="" disabled>
                No hay modelos disponibles - sincroniza las credenciales
              </option>
            </select>

            <!-- Input manual -->
            <input
              v-else
              v-model="form.model"
              placeholder="ej: anthropic/claude-sonnet-4-5, zai/glm-4-plus"
              class="input"
            />

            <p class="help-text">
              <span v-if="!useManualModel">
                Modelos principales por proveedor (requiere credenciales sincronizadas)
              </span>
              <span v-else>
                Ingresa el ID completo del modelo (ej: anthropic/claude-sonnet-4-5)
              </span>
            </p>
          </div>

          <div class="form-actions">
            <button type="button" class="btn-secondary" @click="cancelForm">Cancelar</button>
            <button type="submit" class="btn-primary" :disabled="saving">
              {{ saving ? 'Creando...' : 'Crear' }}
            </button>
          </div>
        </form>
      </div>
    </div>

    <!-- Lista de agentes -->
    <div v-if="agents.length" class="agents-list">
      <div
        v-for="agent in agents"
        :key="agent.id"
        class="agent-card"
        :class="{ 'agent-default': agent.isDefault }"
      >
        <div class="agent-info">
          <div class="agent-header">
            <h3>{{ agent.name || agent.id }}</h3>
            <span v-if="agent.isDefault" class="badge-default">Default</span>
          </div>
          <div class="agent-meta">
            <span class="meta-item">
              <strong>ID:</strong> {{ agent.id }}
            </span>
            <span v-if="agent.workspace" class="meta-item">
              <strong>Workspace:</strong> {{ agent.workspace }}
            </span>
            <span v-if="agent.model" class="meta-item">
              <strong>Modelo:</strong> {{ agent.model }}
            </span>
          </div>
          <div class="agent-bindings">
            <span class="bindings-label">Bindings:</span>
            <span v-if="!agent.bindings || agent.bindings === 0" class="no-bindings">
              Sin bindings configurados
            </span>
            <span v-else class="binding-count">
              {{ agent.bindings }} binding{{ agent.bindings > 1 ? 's' : '' }}
            </span>
          </div>
        </div>
        <div class="agent-actions">
          <button
            v-if="agent.id !== 'main'"
            class="btn-icon btn-danger"
            @click="removeAgent(agent)"
            title="Eliminar agente"
          >
            🗑️
          </button>
        </div>
      </div>
    </div>

    <div v-else-if="!loading" class="empty-state">
      <p>No hay agentes configurados.</p>
      <p class="empty-hint">El agente "main" se crea automáticamente al iniciar OpenClaw.</p>
    </div>

    <!-- Sección de bindings -->
    <div v-if="agentsWithBindings.length" class="bindings-section">
      <h2>Bindings de routing</h2>
      <p class="subtitle">Reglas que determinan cómo se enrutan los mensajes a cada agente.</p>
      <div class="bindings-list">
        <div
          v-for="agent in agentsWithBindings"
          :key="agent.id"
          class="binding-card"
        >
          <div class="binding-info">
            <span class="binding-agent">{{ agent.name || agent.id }}</span>
            <span class="binding-arrow">→</span>
            <span class="binding-match">
              {{ agent.routes?.join(', ') || 'default' }}
            </span>
          </div>
        </div>
      </div>
    </div>

    <div v-if="error" class="error-banner">
      <span>⚠️</span>
      <span>{{ error }}</span>
      <button class="btn-close" @click="error = ''">×</button>
    </div>

    <div v-if="successMessage" class="success-banner">
      <span>✅</span>
      <span>{{ successMessage }}</span>
      <button class="btn-close" @click="successMessage = ''">×</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from "vue";
import * as api from "../api";

interface Agent {
  id: string;
  name?: string;
  workspace?: string;
  model?: string;
  isDefault?: boolean;
  bindings?: number;
  routes?: string[];
  agentDir?: string;
}

interface Model {
  id: string;
  name: string;
}

// Modelos principales por provider (para mostrar en el select)
const MAIN_MODELS: Record<string, string[]> = {
  'anthropic': [
    'anthropic/claude-sonnet-4-5',
    'anthropic/claude-opus-4-6',
    'anthropic/claude-haiku-4-5'
  ],
  'openai': [
    'openai/gpt-4o',
    'openai/gpt-4o-mini',
    'openai/o1-mini'
  ],
  'google': [
    'google/gemini-2.0-flash',
    'google/gemini-1.5-pro'
  ],
  'groq': [
    'groq/llama-3.3-70b-versatile'
  ],
  'openrouter': [
    'openrouter/anthropic/claude-sonnet-4-5',
    'openrouter/openai/gpt-4o'
  ],
  'zai': [
    'zai/glm-5',
    'zai/glm-4.7',
    'zai/glm-4-plus',
    'zai/glm-4.6'
  ],
  'minimax': [
    'minimax/MiniMax-M2.1'
  ]
};

const agents = ref<Agent[]>([]);
const availableModels = ref<Record<string, Model[]>>({});
const loading = ref(false);
const saving = ref(false);
const showForm = ref(false);
const error = ref("");
const successMessage = ref("");
const useManualModel = ref(false); // Toggle para entrada manual de modelo

const form = ref({
  id: "",
  name: "",
  workspace: "",
  model: ""
});

// Modelos principales filtrados para el select
const mainModels = computed(() => {
  const result: Array<{ provider: string; models: Model[] }> = [];

  for (const [provider, modelIds] of Object.entries(MAIN_MODELS)) {
    const providerModels = availableModels.value[provider] || [];
    // Filtrar solo los modelos principales
    const mainOnes = providerModels.filter(m =>
      modelIds.some(id => m.id === id || m.id.endsWith(id))
    );
    if (mainOnes.length > 0) {
      result.push({ provider, models: mainOnes });
    }
  }

  return result;
});

// Agentes que tienen bindings configurados
const agentsWithBindings = computed(() => {
  return agents.value.filter(a => a.bindings && a.bindings > 0);
});

// Mapeo de nombres de provider a etiquetas legibles
const providerLabels: Record<string, string> = {
  'anthropic': 'Anthropic',
  'openai': 'OpenAI',
  'google': 'Google Gemini',
  'groq': 'Groq',
  'openrouter': 'OpenRouter',
  'zai': 'Z.AI (GLM)',
  'minimax': 'MiniMax',
  'moonshot': 'Moonshot/Kimi',
  'deepseek': 'DeepSeek',
  'ollama': 'Ollama (Local)'
};

function getProviderLabel(provider: string): string {
  return providerLabels[provider] || provider.charAt(0).toUpperCase() + provider.slice(1);
}

function cancelForm() {
  showForm.value = false;
  useManualModel.value = false;
  form.value = {
    id: "",
    name: "",
    workspace: "",
    model: ""
  };
}

async function load() {
  loading.value = true;
  try {
    const [agentsResult, models] = await Promise.all([
      api.getAgents(),
      api.getAvailableModels().catch((err) => {
        console.error('[Agents] Error cargando modelos:', err);
        return {};
      })
    ]);

    if (agentsResult.success) {
      agents.value = agentsResult.agents || [];
      availableModels.value = models;

      // Debug: mostrar modelos cargados
      const providerCount = Object.keys(models).length;
      const modelCount = Object.values(models).reduce((sum, arr) => sum + arr.length, 0);
      console.log(`[Agents] Modelos cargados: ${providerCount} providers, ${modelCount} modelos totales`);
      console.log('[Agents] Providers disponibles:', Object.keys(models));

      error.value = "";
    } else {
      error.value = agentsResult.error || "Error al cargar agentes";
    }
  } catch (e) {
    console.error('[Agents] Error en load():', e);
    error.value = e instanceof Error ? e.message : "Error al cargar agentes";
  } finally {
    loading.value = false;
  }
}

async function saveAgent() {
  saving.value = true;
  error.value = "";

  try {
    const result = await api.createAgent(form.value.id, {
      name: form.value.name || undefined,
      workspace: form.value.workspace || undefined,
      model: form.value.model || undefined
    });

    if (result.success) {
      successMessage.value = result.message || `Agente ${form.value.id} creado exitosamente`;
      cancelForm();
      await load();

      setTimeout(() => {
        successMessage.value = "";
      }, 5000);
    } else {
      error.value = result.error || "Error al crear agente";
    }
  } catch (e) {
    error.value = e instanceof Error ? e.message : "Error al crear agente";
  } finally {
    saving.value = false;
  }
}

async function removeAgent(agent: Agent) {
  if (!confirm(`¿Eliminar el agente "${agent.name || agent.id}"? Esta acción no se puede deshacer.`)) {
    return;
  }

  try {
    const result = await api.deleteAgent(agent.id);

    if (result.success) {
      successMessage.value = result.message || `Agente ${agent.id} eliminado`;
      await load();

      setTimeout(() => {
        successMessage.value = "";
      }, 5000);
    } else {
      error.value = result.error || "Error al eliminar agente";
    }
  } catch (e) {
    error.value = e instanceof Error ? e.message : "Error al eliminar agente";
  }
}

onMounted(() => {
  load();
});
</script>

<style scoped>
.agents-page {
  max-width: 1200px;
  margin: 0 auto;
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
  align-items: center;
}

.btn-primary {
  background: #3b82f6;
  color: white;
  border: none;
  padding: 0.75rem 1.5rem;
  border-radius: 6px;
  font-weight: 500;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  transition: background 0.2s;
}

.btn-primary:hover:not(:disabled) {
  background: #2563eb;
}

.btn-primary:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.btn-secondary {
  background: #334155;
  color: white;
  border: none;
  padding: 0.75rem 1.5rem;
  border-radius: 6px;
  cursor: pointer;
  transition: background 0.2s;
}

.btn-secondary:hover {
  background: #475569;
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
  display: flex;
  align-items: center;
  justify-content: center;
}

.btn-close:hover {
  color: white;
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

.btn-icon.btn-danger:hover {
  color: #f87171;
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
  max-width: 500px;
  max-height: 90vh;
  overflow-y: auto;
  box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.3);
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

.form {
  padding: 1.5rem;
}

.form-group {
  margin-bottom: 1.5rem;
}

.form-group label {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.5rem;
  font-weight: 500;
  color: #e2e8f0;
}

.btn-toggle-mode {
  background: #334155;
  color: #94a3b8;
  border: 1px solid #475569;
  padding: 0.25rem 0.75rem;
  border-radius: 4px;
  font-size: 0.75rem;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-toggle-mode:hover {
  background: #475569;
  color: #e2e8f0;
}

.input {
  width: 100%;
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

.help-text {
  margin-top: 0.5rem;
  font-size: 0.875rem;
  color: #94a3b8;
}

.form-actions {
  display: flex;
  gap: 0.75rem;
  justify-content: flex-end;
  margin-top: 2rem;
  padding-top: 1.5rem;
  border-top: 1px solid #334155;
}

/* Lista de agentes */
.agents-list {
  display: grid;
  gap: 1rem;
  margin-bottom: 3rem;
}

.agent-card {
  background: #1e293b;
  border: 1px solid #334155;
  border-radius: 8px;
  padding: 1.5rem;
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  transition: border-color 0.2s;
}

.agent-card:hover {
  border-color: #475569;
}

.agent-card.agent-default {
  border-color: #3b82f6;
  background: linear-gradient(135deg, #1e3a5f 0%, #1e293b 100%);
}

.agent-info {
  flex: 1;
}

.agent-header {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-bottom: 0.75rem;
}

.agent-header h3 {
  margin: 0;
  font-size: 1.125rem;
  font-weight: 600;
}

.badge-default {
  padding: 0.25rem 0.75rem;
  border-radius: 12px;
  font-size: 0.75rem;
  font-weight: 500;
  background: #3b82f6;
  color: white;
}

.agent-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
  font-size: 0.875rem;
  color: #94a3b8;
  margin-bottom: 0.75rem;
}

.meta-item {
  display: flex;
  align-items: center;
}

.agent-bindings {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.875rem;
}

.bindings-label {
  color: #94a3b8;
}

.no-bindings {
  color: #64748b;
  font-style: italic;
}

.binding-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.binding-tag {
  padding: 0.125rem 0.5rem;
  background: #334155;
  border-radius: 4px;
  font-size: 0.75rem;
  color: #e2e8f0;
}

.agent-actions {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

/* Empty state */
.empty-state {
  text-align: center;
  padding: 3rem 1rem;
  color: #94a3b8;
}

.empty-state p {
  margin: 0.5rem 0;
}

.empty-hint {
  font-size: 0.875rem;
}

/* Bindings section */
.bindings-section {
  margin-top: 3rem;
  padding-top: 2rem;
  border-top: 1px solid #334155;
}

.bindings-section h2 {
  font-size: 1.5rem;
  margin: 0 0 0.5rem 0;
}

.bindings-list {
  display: grid;
  gap: 0.75rem;
  margin-top: 1.5rem;
}

.binding-card {
  background: #1e293b;
  border: 1px solid #334155;
  border-radius: 6px;
  padding: 1rem;
}

.binding-info {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  flex-wrap: wrap;
}

.binding-agent {
  font-weight: 600;
  color: #60a5fa;
}

.binding-arrow {
  color: #64748b;
}

.binding-match {
  color: #94a3b8;
  font-size: 0.875rem;
}

/* Error banner */
.error-banner {
  position: fixed;
  bottom: 1rem;
  right: 1rem;
  background: #7f1d1d;
  color: white;
  padding: 1rem 1.5rem;
  border-radius: 8px;
  display: flex;
  align-items: center;
  gap: 0.75rem;
  max-width: 400px;
  box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.3);
  z-index: 1000;
}

.error-banner span:first-child {
  font-size: 1.25rem;
}

/* Success banner */
.success-banner {
  position: fixed;
  bottom: 1rem;
  right: 1rem;
  background: #065f46;
  color: white;
  padding: 1rem 1.5rem;
  border-radius: 8px;
  display: flex;
  align-items: center;
  gap: 0.75rem;
  max-width: 400px;
  box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.3);
  z-index: 1000;
}

.success-banner span:first-child {
  font-size: 1.25rem;
}
</style>
