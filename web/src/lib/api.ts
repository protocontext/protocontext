const API_BASE =
  process.env.NEXT_PUBLIC_API_URL ||
  (typeof window !== "undefined" && window.location.hostname !== "localhost"
    ? "" // Same origin — Caddy routes /search, /submit, etc. to the API
    : "http://localhost:8000");

// ---------------------------------------------------------------------------
// Session token — stored in localStorage (replaces static env var)
// ---------------------------------------------------------------------------

export function getToken(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem("proto_session_token") || "";
}

export function setToken(token: string): void {
  if (typeof window === "undefined") return;
  localStorage.setItem("proto_session_token", token);
}

export function clearToken(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem("proto_session_token");
}

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------

export interface SearchResult {
  domain: string;
  section: string;
  body: string;
  url: string;
  updated: string;
  lang: string;
  freshness: string;
  content_type: string;
  location: string;
  action_url: string;
}

export interface SearchResponse {
  query: string;
  results: SearchResult[];
  latency_ms: number;
}

export interface SiteResponse {
  domain: string;
  sections: SearchResult[];
  total_sections: number;
  latency_ms: number;
}

export interface SubmitResponse {
  status: string;
  domain: string;
  sections_indexed?: number;
  source_format?: string;
  source_path?: string;
}

export interface StatsResponse {
  total_documents: number;
  is_indexing: boolean;
  registered_domains: number;
  cached_domains: number;
  cache_ttl_days: number;
}

export interface HealthResponse {
  status: string;
  typesense: string;
}

export interface AuthStatus {
  needs_setup: boolean;
  legacy_mode: boolean;
}

export interface AuthSetupResponse {
  status: string;
  token: string;
  admin: { name: string; email: string; created_at: string };
}

export interface AuthLoginResponse {
  status: string;
  token: string;
}

interface AiCredentials {
  ai_key?: string;
  ai_model?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildParams(params: Record<string, string | number | undefined | null>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (k === "ai_key" || k === "ai_model") continue; // Never put secrets in URL
    if (v !== undefined && v !== null && v !== "") {
      sp.set(k, String(v));
    }
  }
  return sp.toString();
}

function baseHeaders(creds?: AiCredentials): Record<string, string> {
  const headers: Record<string, string> = {};
  const token = getToken();
  if (token) headers["x-proto-token"] = token;
  if (creds?.ai_key) headers["x-ai-key"] = creds.ai_key;
  if (creds?.ai_model) headers["x-ai-model"] = creds.ai_model;
  return headers;
}

// ---------------------------------------------------------------------------
// Auth endpoints
// ---------------------------------------------------------------------------

export async function getAuthStatus(): Promise<AuthStatus> {
  const res = await fetch(`${API_BASE}/auth/status`);
  if (!res.ok) throw new Error("Failed to check auth status");
  return res.json();
}

export async function authSetup(opts: {
  name: string;
  email: string;
  password: string;
}): Promise<AuthSetupResponse> {
  const res = await fetch(`${API_BASE}/auth/setup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(opts),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || "Setup failed");
  }
  const data: AuthSetupResponse = await res.json();
  setToken(data.token);
  return data;
}

export async function authLogin(opts: {
  email: string;
  password: string;
}): Promise<AuthLoginResponse> {
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(opts),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || "Login failed");
  }
  const data: AuthLoginResponse = await res.json();
  setToken(data.token);
  return data;
}

export async function authLogout(): Promise<void> {
  try {
    await fetch(`${API_BASE}/auth/logout`, {
      method: "POST",
      headers: baseHeaders(),
    });
  } finally {
    clearToken();
  }
}

// ---------------------------------------------------------------------------
// Data endpoints
// ---------------------------------------------------------------------------

export async function search(opts: {
  q: string;
  domain?: string;
  section?: string;
  lang?: string;
  content_type?: string;
  limit?: number;
  ai_key?: string;
  ai_model?: string;
}): Promise<SearchResponse> {
  const qs = buildParams(opts);
  const res = await fetch(`${API_BASE}/search?${qs}`, {
    headers: baseHeaders(opts),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || "Search failed");
  }
  return res.json();
}

export async function getSite(opts: {
  domain: string;
  lang?: string;
  content_type?: string;
  ai_key?: string;
  ai_model?: string;
}): Promise<SiteResponse> {
  const qs = buildParams(opts);
  const res = await fetch(`${API_BASE}/site?${qs}`, {
    headers: baseHeaders(opts),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || "Site fetch failed");
  }
  return res.json();
}

export async function submitDomain(opts: {
  domain: string;
  ai_key?: string;
  ai_model?: string;
}): Promise<SubmitResponse> {
  const res = await fetch(`${API_BASE}/submit`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...baseHeaders() },
    body: JSON.stringify(opts),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || "Submit failed");
  }
  return res.json();
}

export interface DeleteResponse {
  status: string;
  domain: string;
  sections_deleted: number;
  removed_from_registry: boolean;
}

export async function deleteDomain(opts: {
  domain: string;
}): Promise<DeleteResponse> {
  const res = await fetch(`${API_BASE}/delete`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...baseHeaders() },
    body: JSON.stringify(opts),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || "Delete failed");
  }
  return res.json();
}

export interface SubmitProgressEvent {
  step: "checking" | "found" | "sitemap" | "scraping" | "converting" | "converted" | "indexing" | "done" | "error";
  message?: string;
  path?: string;
  progress?: number;
  total?: number;
  scraped?: number;
  sections?: number;
  result?: SubmitResponse;
}

export async function submitDomainStream(
  opts: { domain: string; ai_key?: string; ai_model?: string },
  onProgress: (event: SubmitProgressEvent) => void,
): Promise<SubmitResponse> {
  const res = await fetch(`${API_BASE}/submit-stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...baseHeaders() },
    body: JSON.stringify(opts),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || "Submit failed");
  }

  const reader = res.body?.getReader();
  if (!reader) throw new Error("No response stream");

  const decoder = new TextDecoder();
  let buffer = "";
  let finalResult: SubmitResponse | null = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      if (line.startsWith("data: ")) {
        let event: SubmitProgressEvent;
        try {
          event = JSON.parse(line.slice(6));
        } catch {
          // Malformed JSON from partial chunk — skip safely
          continue;
        }
        onProgress(event);
        if (event.step === "done" && event.result) {
          finalResult = event.result;
        }
        if (event.step === "error") {
          throw new Error(event.message || "Submit failed");
        }
      }
    }
  }

  if (!finalResult) throw new Error("Stream ended without result");
  return finalResult;
}

// ---------------------------------------------------------------------------
// Upload raw context.txt
// ---------------------------------------------------------------------------

export interface UploadResponse {
  status: string;
  name: string;
  sections_indexed: number;
  source_format: string;
}

export async function uploadContext(opts: {
  name: string;
  content: string;
}): Promise<UploadResponse> {
  const res = await fetch(`${API_BASE}/upload`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...baseHeaders() },
    body: JSON.stringify(opts),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Upload failed" }));
    throw new Error(err.detail || "Upload failed");
  }
  return res.json();
}

// ---------------------------------------------------------------------------
// Get raw content (for editing)
// ---------------------------------------------------------------------------

export interface ContentResponse {
  domain: string;
  content: string;
  total_sections: number;
}

export async function getContent(domain: string): Promise<ContentResponse> {
  const res = await fetch(`${API_BASE}/content?domain=${encodeURIComponent(domain)}`, {
    headers: baseHeaders(),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Failed to load content" }));
    throw new Error(err.detail || "Failed to load content");
  }
  return res.json();
}

// ---------------------------------------------------------------------------
// List all indexed domains
// ---------------------------------------------------------------------------

export async function listDomains(): Promise<string[]> {
  const res = await fetch(`${API_BASE}/list`, { headers: baseHeaders() });
  if (!res.ok) return [];
  const data = await res.json();
  return data.domains ?? [];
}

// ---------------------------------------------------------------------------
// Settings (admin AI config, persisted server-side)
// ---------------------------------------------------------------------------

export interface SettingsResponse {
  ai_provider?: string;
  ai_key?: string;
  ai_model?: string;
}

export async function getSettings(): Promise<SettingsResponse> {
  const res = await fetch(`${API_BASE}/settings`, { headers: baseHeaders() });
  if (!res.ok) return {};
  return res.json();
}

export async function saveSettings(data: SettingsResponse): Promise<void> {
  await fetch(`${API_BASE}/settings`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...baseHeaders() },
    body: JSON.stringify(data),
  });
}

// ---------------------------------------------------------------------------
// API Keys (admin)
// ---------------------------------------------------------------------------

export interface ApiKeyInfo {
  id: number;
  key?: string; // Only present on creation
  key_prefix: string;
  name: string;
  created_at: string;
  last_used_at: string | null;
  is_active: boolean;
}

export async function createApiKey(name: string = ""): Promise<ApiKeyInfo> {
  const res = await fetch(`${API_BASE}/api-keys`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...baseHeaders() },
    body: JSON.stringify({ name }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || "Failed to create API key");
  }
  return res.json();
}

export async function listApiKeys(): Promise<ApiKeyInfo[]> {
  const res = await fetch(`${API_BASE}/api-keys`, { headers: baseHeaders() });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || "Failed to list API keys");
  }
  return res.json();
}

export async function revokeApiKey(keyId: number): Promise<void> {
  const res = await fetch(`${API_BASE}/api-keys/${keyId}`, {
    method: "DELETE",
    headers: baseHeaders(),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || "Failed to revoke API key");
  }
}

// ---------------------------------------------------------------------------
// Stats / Health
// ---------------------------------------------------------------------------

export async function getStats(): Promise<StatsResponse> {
  const res = await fetch(`${API_BASE}/stats`, { headers: baseHeaders() });
  if (!res.ok) throw new Error("Stats fetch failed");
  return res.json();
}

export async function getHealth(): Promise<HealthResponse> {
  // Health is a public endpoint — no token needed
  const res = await fetch(`${API_BASE}/health`);
  if (!res.ok) throw new Error("Health check failed");
  return res.json();
}
