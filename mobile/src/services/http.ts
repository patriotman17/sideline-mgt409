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

/** Simulates network latency for mock services so loading states are exercised. */
export const mockDelay = (ms = 120) => new Promise((r) => setTimeout(r, ms));
