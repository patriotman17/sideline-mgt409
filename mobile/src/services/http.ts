import { API_BASE_URL } from './config';

export class ApiError extends Error {
  constructor(
    message: string,
    public status?: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/** Minimal JSON GET helper for the Sideline backend with a request timeout. */
export async function apiGet<T>(path: string, timeoutMs = 4000): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${API_BASE_URL}${path}`, { signal: controller.signal });
    if (!res.ok) throw new ApiError(`Request failed: ${res.status}`, res.status);
    return (await res.json()) as T;
  } catch (err) {
    if (err instanceof ApiError) throw err;
    throw new ApiError(err instanceof Error ? err.message : 'Network error');
  } finally {
    clearTimeout(timer);
  }
}

/** JSON request with a method and optional body. Returns `undefined` for 204 responses. */
export async function apiRequest<T>(method: 'POST' | 'PUT' | 'DELETE', path: string, body?: unknown, timeoutMs = 6000): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${API_BASE_URL}${path}`, {
      method,
      signal: controller.signal,
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!res.ok) {
      const detail = await res.json().catch(() => null);
      throw new ApiError((detail as { detail?: string } | null)?.detail ?? `Request failed: ${res.status}`, res.status);
    }
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
