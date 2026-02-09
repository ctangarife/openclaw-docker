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
  data: { enabled?: boolean; name?: string; token?: string; metadata?: Record<string, any> }
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
