<template>
  <div class="credentials-page">
    <div class="header">
      <h1>Credenciales API</h1>
      <p class="subtitle">Gestiona las API keys de los proveedores de modelos. Se sincronizan automáticamente con OpenClaw.</p>
      <div class="header-actions">
        <button 
          class="btn-secondary" 
          @click="syncNow"
          :disabled="syncing"
          title="Sincronizar manualmente con OpenClaw"
        >
          <span v-if="syncing">🔄</span>
          <span v-else>🔄</span>
          {{ syncing ? 'Sincronizando...' : 'Sincronizar ahora' }}
        </button>
        <button class="btn-primary" @click="showForm = true">
          <span>+</span> Agregar credencial
        </button>
      </div>
    </div>

    <!-- Formulario modal -->
    <div v-if="showForm" class="modal-overlay" @click.self="cancelForm">
      <div class="modal-card">
        <div class="modal-header">
          <h2>{{ editingId ? 'Editar' : 'Nueva' }} credencial</h2>
          <button class="btn-close" @click="cancelForm">×</button>
        </div>
        
        <form @submit.prevent="saveCredential" class="form">
          <!-- Selector de proveedor -->
          <div class="form-group">
            <label>Proveedor *</label>
            <select 
              v-model="form.provider" 
              @change="onProviderChange"
              :disabled="!!editingId"
              required
              class="select-provider"
            >
              <option value="">Selecciona un proveedor</option>
              <optgroup label="Anthropic">
                <option value="anthropic">Anthropic API Key</option>
                <option value="anthropic-oauth">Anthropic OAuth (Claude Code CLI)</option>
                <option value="anthropic-token">Anthropic Token (setup-token)</option>
              </optgroup>
              <optgroup label="OpenAI">
                <option value="openai">OpenAI API Key</option>
                <option value="openai-codex-cli">OpenAI Code Subscription (Codex CLI)</option>
                <option value="openai-codex-oauth">OpenAI Code Subscription (OAuth)</option>
              </optgroup>
              <optgroup label="Otros proveedores">
                <option value="minimax">MiniMax M2.1</option>
                <option value="moonshot">Moonshot AI (Kimi)</option>
                <option value="kimi-coding">Kimi Coding</option>
                <option value="synthetic">Synthetic (Anthropic-compatible)</option>
                <option value="opencode-zen">OpenCode Zen</option>
              </optgroup>
              <optgroup label="Gateways">
                <option value="vercel-ai-gateway">Vercel AI Gateway</option>
                <option value="cloudflare-ai-gateway">Cloudflare AI Gateway</option>
              </optgroup>
              <optgroup label="Genérico">
                <option value="generic">API Key (genérico)</option>
              </optgroup>
            </select>
            <p v-if="selectedProviderInfo" class="provider-description">
              {{ selectedProviderInfo.description }}
            </p>
          </div>

          <!-- Nombre -->
          <div class="form-group">
            <label>Nombre (opcional)</label>
            <input 
              v-model="form.name" 
              :placeholder="form.name || selectedProviderInfo?.defaultName || 'Nombre descriptivo'"
              class="input"
            />
          </div>

          <!-- Campos específicos según proveedor -->
          <template v-if="form.provider === 'cloudflare-ai-gateway'">
            <div class="form-group">
              <label>Account ID *</label>
              <input v-model="form.cloudflareAccountId" placeholder="Cloudflare Account ID" required class="input" />
            </div>
            <div class="form-group">
              <label>Gateway ID *</label>
              <input v-model="form.cloudflareGatewayId" placeholder="Cloudflare Gateway ID" required class="input" />
            </div>
            <div class="form-group">
              <label>API Key *</label>
              <input v-model="form.token" type="password" placeholder="CLOUDFLARE_AI_GATEWAY_API_KEY" required class="input" />
            </div>
          </template>

          <template v-else-if="form.provider === 'vercel-ai-gateway'">
            <div class="form-group">
              <label>API Key *</label>
              <input v-model="form.token" type="password" placeholder="AI_GATEWAY_API_KEY" required class="input" />
            </div>
          </template>

          <template v-else-if="form.provider === 'opencode-zen'">
            <div class="form-group">
              <label>API Key *</label>
              <input v-model="form.token" type="password" placeholder="OPENCODE_API_KEY o OPENCODE_ZEN_API_KEY" required class="input" />
            </div>
          </template>

          <template v-else-if="form.provider === 'synthetic'">
            <div class="form-group">
              <label>API Key *</label>
              <input v-model="form.token" type="password" placeholder="SYNTHETIC_API_KEY" required class="input" />
            </div>
          </template>

          <template v-else-if="form.provider">
            <div class="form-group">
              <label>{{ selectedProviderInfo?.tokenLabel || 'Token / API Key' }} *</label>
              <input 
                v-model="form.token" 
                type="password" 
                :placeholder="selectedProviderInfo?.tokenPlaceholder || 'Ingresa tu API key'"
                :required="!editingId"
                class="input"
              />
              <p v-if="selectedProviderInfo?.helpUrl" class="help-text">
                <a :href="selectedProviderInfo.helpUrl" target="_blank" rel="noopener noreferrer">
                  {{ selectedProviderInfo.helpText || 'Más información' }} →
                </a>
              </p>
            </div>
          </template>

          <div class="form-actions">
            <button type="button" class="btn-secondary" @click="cancelForm">Cancelar</button>
            <button type="submit" class="btn-primary">Guardar</button>
          </div>
        </form>
      </div>
    </div>

    <!-- Lista de credenciales -->
    <div v-if="list.length" class="credentials-list">
      <div 
        v-for="c in list" 
        :key="c._id" 
        class="credential-card"
        :class="{ disabled: !c.enabled }"
      >
        <div class="credential-info">
          <div class="credential-header">
            <h3>{{ c.name || c.provider }}</h3>
            <span class="provider-badge" :class="getProviderClass(c.provider)">
              {{ getProviderDisplayName(c.provider) }}
            </span>
          </div>
          <div class="credential-meta">
            <span class="meta-item">
              Creado: {{ formatDate(c.createdAt) }}
            </span>
            <span v-if="c.updatedAt !== c.createdAt" class="meta-item">
              Actualizado: {{ formatDate(c.updatedAt) }}
            </span>
          </div>
        </div>
        <div class="credential-actions">
          <label class="toggle-switch">
            <input 
              type="checkbox" 
              :checked="c.enabled"
              @change="toggle(c)"
            />
            <span class="toggle-slider"></span>
            <span class="toggle-label">{{ c.enabled ? 'Activo' : 'Inactivo' }}</span>
          </label>
          <button class="btn-icon" @click="edit(c)" title="Editar">✏️</button>
          <button class="btn-icon btn-danger" @click="remove(c)" title="Eliminar">🗑️</button>
        </div>
      </div>
    </div>

    <div v-else class="empty-state">
      <p>No hay credenciales configuradas.</p>
      <p class="empty-hint">Agrega una credencial para que OpenClaw pueda usar modelos de ese proveedor.</p>
    </div>

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

interface Credential {
  _id: string;
  provider: string;
  name: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

interface ProviderInfo {
  description: string;
  defaultName: string;
  tokenLabel?: string;
  tokenPlaceholder?: string;
  helpUrl?: string;
  helpText?: string;
}

const list = ref<Credential[]>([]);
const error = ref("");
const syncMessage = ref("");
const syncing = ref(false);
const showForm = ref(false);
const editingId = ref<string | null>(null);
const form = ref({
  provider: "",
  name: "",
  token: "",
  cloudflareAccountId: "",
  cloudflareGatewayId: "",
});

const providers: Record<string, ProviderInfo> = {
  "anthropic": {
    description: "API key de Anthropic para Claude. Recomendado para uso general.",
    defaultName: "Anthropic API Key",
    tokenLabel: "ANTHROPIC_API_KEY",
    tokenPlaceholder: "sk-ant-...",
  },
  "anthropic-oauth": {
    description: "OAuth de Anthropic (Claude Code CLI). Reutiliza credenciales del sistema.",
    defaultName: "Anthropic OAuth",
  },
  "anthropic-token": {
    description: "Token de setup de Anthropic. Genera con 'claude setup-token'.",
    defaultName: "Anthropic Setup Token",
    tokenPlaceholder: "Pega el token generado",
  },
  "openai": {
    description: "API key de OpenAI para GPT-4, GPT-3.5, etc.",
    defaultName: "OpenAI API Key",
    tokenLabel: "OPENAI_API_KEY",
    tokenPlaceholder: "sk-...",
  },
  "openai-codex-cli": {
    description: "OpenAI Code Subscription usando Codex CLI. Reutiliza credenciales existentes.",
    defaultName: "OpenAI Codex CLI",
  },
  "openai-codex-oauth": {
    description: "OpenAI Code Subscription vía OAuth. Flujo de navegador.",
    defaultName: "OpenAI Codex OAuth",
  },
  "minimax": {
    description: "MiniMax M2.1. Configuración automática.",
    defaultName: "MiniMax M2.1",
    helpUrl: "https://docs.openclaw.ai/providers/minimax",
  },
  "moonshot": {
    description: "Moonshot AI (Kimi K2). Configuración automática.",
    defaultName: "Moonshot AI",
    helpUrl: "https://docs.openclaw.ai/providers/moonshot",
  },
  "kimi-coding": {
    description: "Kimi Coding. Configuración automática.",
    defaultName: "Kimi Coding",
    helpUrl: "https://docs.openclaw.ai/providers/moonshot",
  },
  "synthetic": {
    description: "Synthetic (compatible con Anthropic).",
    defaultName: "Synthetic API",
    tokenLabel: "SYNTHETIC_API_KEY",
    helpUrl: "https://docs.openclaw.ai/providers/synthetic",
  },
  "opencode-zen": {
    description: "OpenCode Zen API.",
    defaultName: "OpenCode Zen",
    tokenLabel: "OPENCODE_API_KEY",
    helpUrl: "https://opencode.ai/auth",
  },
  "vercel-ai-gateway": {
    description: "Vercel AI Gateway para enrutar requests a múltiples proveedores.",
    defaultName: "Vercel AI Gateway",
    tokenLabel: "AI_GATEWAY_API_KEY",
    helpUrl: "https://docs.openclaw.ai/providers/vercel-ai-gateway",
  },
  "cloudflare-ai-gateway": {
    description: "Cloudflare AI Gateway. Requiere Account ID, Gateway ID y API Key.",
    defaultName: "Cloudflare AI Gateway",
    helpUrl: "https://docs.openclaw.ai/providers/cloudflare-ai-gateway",
  },
  "generic": {
    description: "API key genérica para cualquier proveedor no listado.",
    defaultName: "API Key Genérica",
    tokenPlaceholder: "Ingresa tu API key",
  },
};

const selectedProviderInfo = computed(() => {
  return form.value.provider ? providers[form.value.provider] : null;
});

function getProviderDisplayName(provider: string): string {
  return providers[provider]?.defaultName || provider;
}

function getProviderClass(provider: string): string {
  if (provider.startsWith("anthropic")) return "badge-anthropic";
  if (provider.startsWith("openai")) return "badge-openai";
  if (provider.includes("gateway")) return "badge-gateway";
  return "badge-default";
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString("es-ES", { 
    year: "numeric", 
    month: "short", 
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function onProviderChange() {
  if (!editingId.value && selectedProviderInfo.value) {
    form.value.name = selectedProviderInfo.value.defaultName;
  }
}

async function load() {
  try {
    list.value = await api.getCredentials();
    error.value = "";
  } catch (e) {
    error.value = e instanceof Error ? e.message : "Error al cargar credenciales";
  }
}

function cancelForm() {
  showForm.value = false;
  editingId.value = null;
  form.value = {
    provider: "",
    name: "",
    token: "",
    cloudflareAccountId: "",
    cloudflareGatewayId: "",
  };
}

function edit(c: Credential & { metadata?: Record<string, any> }) {
  editingId.value = c._id;
  form.value = {
    provider: c.provider,
    name: c.name,
    token: "",
    cloudflareAccountId: c.metadata?.accountId || "",
    cloudflareGatewayId: c.metadata?.gatewayId || "",
  };
  showForm.value = true;
}

async function saveCredential() {
  try {
    // Para Cloudflare, guardamos metadata adicional
    const metadata: Record<string, any> = {};
    if (form.value.provider === "cloudflare-ai-gateway") {
      metadata.accountId = form.value.cloudflareAccountId;
      metadata.gatewayId = form.value.cloudflareGatewayId;
    }

    if (editingId.value) {
      const payload: { name?: string; token?: string; metadata?: Record<string, any> } = { 
        name: form.value.name 
      };
      if (form.value.token) payload.token = form.value.token;
      if (Object.keys(metadata).length > 0) payload.metadata = metadata;
      await api.updateCredential(editingId.value, payload);
    } else {
      await api.createCredential(
        form.value.provider, 
        form.value.name, 
        form.value.token,
        Object.keys(metadata).length > 0 ? metadata : undefined
      );
    }
    cancelForm();
    await load();
  } catch (e) {
    error.value = e instanceof Error ? e.message : "Error al guardar credencial";
  }
}

async function toggle(c: Credential) {
  try {
    await api.updateCredential(c._id, { enabled: !c.enabled });
    await load();
  } catch (e) {
    error.value = e instanceof Error ? e.message : "Error al actualizar estado";
  }
}

async function remove(c: Credential) {
  if (!confirm(`¿Eliminar la credencial "${c.name || c.provider}"?`)) return;
  try {
    await api.deleteCredential(c._id);
    await load();
  } catch (e) {
    error.value = e instanceof Error ? e.message : "Error al eliminar";
  }
}

async function syncNow() {
  syncing.value = true;
  syncMessage.value = "";
  error.value = "";
  try {
    const result = await api.syncCredentials();
    const profileCount = result.profiles?.length || 0;
    
    // Verificar si el gateway se reinició
    if (result.gatewayRestarted) {
      syncMessage.value = `✅ Sincronización exitosa: ${profileCount} credencial(es) sincronizada(s). Gateway reiniciado automáticamente.`;
    } else if (result.restartError) {
      syncMessage.value = `✅ Sincronización exitosa: ${profileCount} credencial(es). ⚠️ No se pudo reiniciar el gateway: ${result.restartError}`;
    } else {
      syncMessage.value = `✅ Sincronización exitosa: ${profileCount} credencial(es) sincronizada(s) con OpenClaw`;
    }
    
    // Mostrar nota si existe
    if (result.note) {
      console.log('Nota del servidor:', result.note);
    }
    
    // Ocultar mensaje después de 5 segundos
    setTimeout(() => {
      syncMessage.value = "";
    }, 5000);
  } catch (e) {
    error.value = e instanceof Error ? e.message : "Error al sincronizar";
  } finally {
    syncing.value = false;
  }
}

onMounted(load);
</script>

<style scoped>
.credentials-page {
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

.header-actions .btn-secondary:disabled {
  opacity: 0.6;
  cursor: not-allowed;
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

.btn-primary:hover {
  background: #2563eb;
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
  max-width: 600px;
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
  display: block;
  margin-bottom: 0.5rem;
  font-weight: 500;
  color: #e2e8f0;
}

.input,
.select-provider {
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
.select-provider:focus {
  outline: none;
  border-color: #3b82f6;
}

.provider-description {
  margin-top: 0.5rem;
  font-size: 0.875rem;
  color: #94a3b8;
  line-height: 1.5;
}

.help-text {
  margin-top: 0.5rem;
  font-size: 0.875rem;
}

.help-text a {
  color: #60a5fa;
  text-decoration: none;
}

.help-text a:hover {
  text-decoration: underline;
}

.form-actions {
  display: flex;
  gap: 0.75rem;
  justify-content: flex-end;
  margin-top: 2rem;
  padding-top: 1.5rem;
  border-top: 1px solid #334155;
}

/* Lista de credenciales */
.credentials-list {
  display: grid;
  gap: 1rem;
}

.credential-card {
  background: #1e293b;
  border: 1px solid #334155;
  border-radius: 8px;
  padding: 1.5rem;
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  transition: border-color 0.2s;
}

.credential-card:hover {
  border-color: #475569;
}

.credential-card.disabled {
  opacity: 0.6;
}

.credential-info {
  flex: 1;
}

.credential-header {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-bottom: 0.75rem;
}

.credential-header h3 {
  margin: 0;
  font-size: 1.125rem;
  font-weight: 600;
}

.provider-badge {
  padding: 0.25rem 0.75rem;
  border-radius: 12px;
  font-size: 0.75rem;
  font-weight: 500;
  background: #334155;
  color: #e2e8f0;
}

.badge-anthropic {
  background: #4c1d95;
  color: #e9d5ff;
}

.badge-openai {
  background: #1e3a8a;
  color: #bfdbfe;
}

.badge-gateway {
  background: #065f46;
  color: #a7f3d0;
}

.credential-meta {
  display: flex;
  gap: 1rem;
  font-size: 0.875rem;
  color: #94a3b8;
}

.meta-item {
  display: flex;
  align-items: center;
}

.credential-actions {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

/* Toggle switch */
.toggle-switch {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  cursor: pointer;
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

.toggle-label {
  font-size: 0.875rem;
  color: #94a3b8;
  user-select: none;
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
