const API_BASE = "";

function getHeaders(): HeadersInit {
  const secret = localStorage.getItem("uiSecret");
  const h: HeadersInit = { "Content-Type": "application/json" };
  if (secret) (h as Record<string, string>)["X-UI-Secret"] = secret;
  return h;
}

export async function getCredentials() {
  const r = await fetch(`${API_BASE}/api/credentials`, { headers: getHeaders() });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function createCredential(
  provider: string, 
  name: string, 
  token: string, 
  metadata?: Record<string, any>
) {
  const r = await fetch(`${API_BASE}/api/credentials`, {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify({ provider, name: name || provider, token, metadata }),
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function updateCredential(
  id: string,
  data: { enabled?: boolean; name?: string; token?: string; metadata?: Record<string, any>; fallbackModel?: string | null }
) {
  const r = await fetch(`${API_BASE}/api/credentials/${id}`, {
    method: "PATCH",
    headers: getHeaders(),
    body: JSON.stringify(data),
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function deleteCredential(id: string) {
  const r = await fetch(`${API_BASE}/api/credentials/${id}`, {
    method: "DELETE",
    headers: getHeaders(),
  });
  if (!r.ok) throw new Error(await r.text());
}

export async function syncCredentials() {
  const r = await fetch(`${API_BASE}/api/credentials/sync`, {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify({}), // Enviar objeto vacío para evitar error de parsing
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function getAvailableProviders() {
  const r = await fetch(`${API_BASE}/api/credentials/available-providers`, { headers: getHeaders() });
  if (!r.ok) throw new Error(await r.text());
  return r.json() as Promise<Array<{
    value: string;
    label: string;
    group: string;
    description: string;
    defaultName: string;
    tokenLabel?: string;
    tokenPlaceholder?: string;
    helpUrl?: string;
    helpText?: string;
    requiresMetadata?: boolean;
    metadataFields?: Array<{ name: string; label: string; placeholder: string }>;
  }>>;
}

export async function validateCredential(provider: string, token: string, metadata?: Record<string, any>) {
  const r = await fetch(`${API_BASE}/api/credentials/validate`, {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify({ provider, token, metadata }),
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json() as Promise<{ valid: boolean; error?: string; warning?: string; info?: string; details?: any }>;
}

export { getHeaders };

export async function getConfig() {
  const r = await fetch(`${API_BASE}/api/config`, { headers: getHeaders() });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function getAvailableModels() {
  const r = await fetch(`${API_BASE}/api/config/available-models`, { headers: getHeaders() });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function putConfig(config: Record<string, unknown>) {
  const r = await fetch(`${API_BASE}/api/config`, {
    method: "PUT",
    headers: getHeaders(),
    body: JSON.stringify(config),
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

// Rate Limiting Configuration
export async function getQueueConfig() {
  const r = await fetch(`${API_BASE}/api/queue/config`, { headers: getHeaders() });
  if (!r.ok) throw new Error(await r.text());
  return r.json() as Promise<{
    success: boolean;
    config: {
      providerLimits: Record<string, number>;
      globalEnabled: boolean;
      maxRetries: number;
      enableFallback: boolean;
    };
    currentLimits: Record<string, number>;
    defaults: Record<string, number>;
    updatedAt: string;
  }>;
}

export async function saveQueueConfig(config: {
  providerLimits?: Record<string, number>;
  globalEnabled?: boolean;
  maxRetries?: number;
  enableFallback?: boolean;
}) {
  const r = await fetch(`${API_BASE}/api/queue/config`, {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify(config),
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function getQueueStats() {
  const r = await fetch(`${API_BASE}/api/queue/stats`, { headers: getHeaders() });
  if (!r.ok) throw new Error(await r.text());
  return r.json() as Promise<{
    success: boolean;
    timestamp: string;
    queues: Record<string, { running: number; queued: number; limit: number }>;
    summary: { totalProviders: number; totalRunning: number; totalQueued: number };
  }>;
}
