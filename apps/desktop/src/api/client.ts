// API Client for Wholesale ERP Local / Cloud Node Server

export const CLOUD_API_URL = 'https://sn-inventory-app-sh3v.vercel.app/api/v1';
export const LOCAL_API_URL = 'http://localhost:4000/api/v1';

export function getApiBaseUrl(): string {
  if (typeof window !== 'undefined') {
    const saved = localStorage.getItem('erp_api_url');
    if (saved && saved.trim()) return saved.trim();
  }
  return (import.meta.env.VITE_API_URL as string) || CLOUD_API_URL;
}

export function setApiBaseUrl(url: string): void {
  if (typeof window !== 'undefined') {
    localStorage.setItem('erp_api_url', url.trim());
    window.dispatchEvent(new CustomEvent('erp_api_url_changed', { detail: url.trim() }));
  }
}

export class ApiError extends Error {
  constructor(public code: string, message: string, public issues?: unknown[]) {
    super(message);
    this.name = 'ApiError';
  }
}

export async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const token = localStorage.getItem('erp_token');
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const baseUrl = getApiBaseUrl();
  const url = endpoint.startsWith('http') ? endpoint : `${baseUrl}${endpoint}`;

  try {
    const res = await fetch(url, { ...options, headers });
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
  } catch (err: unknown) {
    if (err instanceof ApiError) throw err;
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
