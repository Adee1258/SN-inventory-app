// API Client for Wholesale ERP Local / Cloud Node Server

export const CLOUD_API_URL =
  (import.meta.env.VITE_API_URL as string) || 'https://sn-inventory-app-sh3v.vercel.app/api/v1';
export const LOCAL_API_URL = 'http://127.0.0.1:4000/api/v1';

export type ApiMode = 'auto' | 'online' | 'offline';
export type ActiveBackend = 'cloud' | 'local';

function isElectronOrLocal(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.location.protocol === 'file:' ||
    window.location.hostname === 'localhost' ||
    window.location.hostname === '127.0.0.1' ||
    navigator.userAgent.toLowerCase().includes('electron')
  );
}

// Always start with cloud; auto mode will probe and fallback to local if cloud unreachable
let activeBackend: ActiveBackend = 'cloud';

export function getApiMode(): ApiMode {
  if (typeof window !== 'undefined') {
    const saved = localStorage.getItem('erp_api_mode') as ApiMode | null;
    if (saved === 'auto' || saved === 'online' || saved === 'offline') {
      return saved;
    }
  }
  // Default: always auto (cloud-first, fallback to local)
  return 'auto';
}

export function setApiMode(mode: ApiMode): void {
  if (typeof window !== 'undefined') {
    localStorage.setItem('erp_api_mode', mode);
    if (mode === 'offline') setActiveBackend('local');
    if (mode === 'online') setActiveBackend('cloud');
    window.dispatchEvent(new CustomEvent('erp_api_mode_changed', { detail: mode }));
  }
}

export function getActiveBackend(): ActiveBackend {
  const mode = getApiMode();
  if (mode === 'offline') return 'local';
  if (mode === 'online') return 'cloud';
  return activeBackend;
}

function setActiveBackend(next: ActiveBackend): void {
  if (activeBackend !== next) {
    activeBackend = next;
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('erp_backend_changed', { detail: next }));
    }
  }
}

export function getApiBaseUrl(): string {
  if (typeof window !== 'undefined') {
    const customUrl = localStorage.getItem('erp_api_url');
    if (customUrl && customUrl.trim()) return customUrl.trim();
  }
  return getActiveBackend() === 'local' ? LOCAL_API_URL : CLOUD_API_URL;
}

export function setApiBaseUrl(url: string): void {
  if (typeof window !== 'undefined') {
    localStorage.setItem('erp_api_url', url.trim());
    window.dispatchEvent(new CustomEvent('erp_api_url_changed', { detail: url.trim() }));
  }
}

async function fetchWithTimeout(
  url: string,
  options: RequestInit = {},
  timeoutMs = 8000
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function probeHealth(baseUrl: string, timeoutMs: number): Promise<boolean> {
  try {
    const rootUrl = baseUrl.replace(/\/api\/v1\/?$/, '');
    const res = await fetchWithTimeout(`${rootUrl}/health`, {}, timeoutMs);
    if (!res.ok) return false;
    const data = await res.json();
    return Boolean(data.databaseConnected || data.status === 'OK');
  } catch {
    return false;
  }
}

/**
 * Checks connectivity based on current ApiMode:
 * - 'auto': prefers Cloud (3s timeout); falls back to Local Server if Cloud is unreachable/slow.
 * - 'online': checks Cloud only.
 * - 'offline': checks Local Server only.
 */
export async function resolveBackendHealth(): Promise<{
  connected: boolean;
  backend: ActiveBackend;
}> {
  const mode = getApiMode();

  if (mode === 'offline') {
    setActiveBackend('local');
    const ok = await probeHealth(LOCAL_API_URL, 2500);
    return { connected: ok, backend: 'local' };
  }

  if (mode === 'online') {
    setActiveBackend('cloud');
    const ok = await probeHealth(CLOUD_API_URL, 4000);
    return { connected: ok, backend: 'cloud' };
  }

  // Auto mode: try Cloud fast (3s), fallback to Local
  const cloudOk = await probeHealth(CLOUD_API_URL, 3000);
  if (cloudOk) {
    setActiveBackend('cloud');
    return { connected: true, backend: 'cloud' };
  }

  const localOk = await probeHealth(LOCAL_API_URL, 2000);
  setActiveBackend('local');
  return { connected: localOk, backend: 'local' };
}

export class ApiError extends Error {
  constructor(public code: string, message: string, public issues?: unknown[]) {
    super(message);
    this.name = 'ApiError';
  }
}

async function executeFetch<T>(
  baseUrl: string,
  endpoint: string,
  options: RequestInit,
  timeoutMs: number
): Promise<T> {
  const token = localStorage.getItem('erp_token');
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const url = endpoint.startsWith('http') ? endpoint : `${baseUrl}${endpoint}`;
  const res = await fetchWithTimeout(url, { ...options, headers }, timeoutMs);
  const json = await res.json();

  if (!res.ok || json.success === false) {
    if (res.status === 401) {
      localStorage.removeItem('erp_token');
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('erp_auth_expired'));
      }
    }
    throw new ApiError(
      json.error || 'API_REQUEST_FAILED',
      json.message || `Request to ${endpoint} failed with status ${res.status}`,
      json.issues
    );
  }

  return json.data as T;
}

export async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const mode = getApiMode();
  const baseUrl = getApiBaseUrl();
  const isCloud = baseUrl === CLOUD_API_URL;
  const timeoutMs = isCloud ? 5000 : 12000;

  try {
    return await executeFetch<T>(baseUrl, endpoint, options, timeoutMs);
  } catch (err: unknown) {
    if (err instanceof ApiError) throw err;

    // In Auto mode, if Cloud fails/times out, automatically switch to Local Server and retry
    if (mode === 'auto' && isCloud && !endpoint.startsWith('http')) {
      setActiveBackend('local');
      try {
        return await executeFetch<T>(LOCAL_API_URL, endpoint, options, 12000);
      } catch (localErr: unknown) {
        if (localErr instanceof ApiError) throw localErr;
        const localMsg = localErr instanceof Error ? localErr.message : 'Network request failed';
        throw new ApiError('NETWORK_ERROR', `Server connection error (${LOCAL_API_URL}): ${localMsg}`);
      }
    }

    const msg = err instanceof Error ? err.message : 'Network request failed';
    throw new ApiError('NETWORK_ERROR', `Server connection error (${baseUrl}): ${msg}`);
  }
}

export const api = {
  get: <T>(endpoint: string) => request<T>(endpoint, { method: 'GET' }),
  post: <T>(endpoint: string, body: unknown) =>
    request<T>(endpoint, { method: 'POST', body: JSON.stringify(body) }),
  put: <T>(endpoint: string, body: unknown) =>
    request<T>(endpoint, { method: 'PUT', body: JSON.stringify(body) }),
  patch: <T>(endpoint: string, body: unknown) =>
    request<T>(endpoint, { method: 'PATCH', body: JSON.stringify(body) }),
  delete: <T>(endpoint: string) => request<T>(endpoint, { method: 'DELETE' }),
};
