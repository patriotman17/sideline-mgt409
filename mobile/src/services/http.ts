import { API_BASE_URL } from './config';

export class ApiError extends Error {
  constructor(
    message: string,
    public status?: number,
    /** Machine-readable error code from the backend (e.g. "not_configured", "rate_limited"). */
    public code?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/** Turn a FastAPI error body (`{detail: string | {code, message}}`) into an ApiError. */
async function errorFrom(res: Response): Promise<ApiError> {
  const body = (await res.json().catch(() => null)) as { detail?: unknown } | null;
  const detail = body?.detail;
  if (detail && typeof detail === 'object' && 'message' in detail) {
    const d = detail as { message: string; code?: string };
    return new ApiError(d.message, res.status, d.code);
  }
  return new ApiError(typeof detail === 'string' ? detail : `Request failed: ${res.status}`, res.status);
}

/** Minimal JSON GET helper for the Sideline backend with a request timeout. */
export async function apiGet<T>(path: string, timeoutMs = 4000, headers?: Record<string, string>): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${API_BASE_URL}${path}`, { signal: controller.signal, headers });
    if (!res.ok) throw await errorFrom(res);
    return (await res.json()) as T;
  } catch (err) {
    if (err instanceof ApiError) throw err;
    throw new ApiError(err instanceof Error ? err.message : 'Network error');
  } finally {
    clearTimeout(timer);
  }
}

/** JSON request with a method and optional body. Returns `undefined` for 204 responses. */
export async function apiRequest<T>(
  method: 'POST' | 'PUT' | 'DELETE',
  path: string,
  body?: unknown,
  { timeoutMs = 6000, headers }: { timeoutMs?: number; headers?: Record<string, string> } = {},
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${API_BASE_URL}${path}`, {
      method,
      signal: controller.signal,
      headers: { ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!res.ok) throw await errorFrom(res);
    return (res.status === 204 ? undefined : await res.json()) as T;
  } catch (err) {
    if (err instanceof ApiError) throw err;
    throw new ApiError(err instanceof Error ? err.message : 'Network error');
  } finally {
    clearTimeout(timer);
  }
}

/** Simulates network latency for mock services so loading states are exercised. */
export const mockDelay = (ms = 120) => new Promise((r) => setTimeout(r, ms));
