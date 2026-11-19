// API Client for Wholesale ERP Local / Cloud Node Server

const isLocalHost = typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
const BASE_URL =
  (import.meta.env.VITE_API_URL as string) ||
  (isLocalHost ? 'http://localhost:4000/api/v1' : '/api/v1');

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

  const url = endpoint.startsWith('http') ? endpoint : `${BASE_URL}${endpoint}`;

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
    throw new ApiError('NETWORK_ERROR', `Local server connection error: ${msg}`);
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
