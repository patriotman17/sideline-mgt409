import { API_BASE_URL } from './config';
import { apiGet } from './http';

export interface HealthResponse {
  status: 'ok';
  service: string;
  version: string;
  environment: string;
}

export const getBackendHealth = () => apiGet<HealthResponse>('/health', 2500);

/**
 * Wait for the backend to answer, for up to `maxMs`. Free hosting (Render) puts an idle server to
 * sleep and the first request wakes it, which can take 30-60 s; normal timeouts would fail first.
 * `onSlow` fires once if the first try doesn't answer quickly (so the UI can say it's waking up).
 * Only hosted (https) backends sleep; a local one that isn't running fails after a few seconds.
 */
export async function waitForBackend(
  maxMs = API_BASE_URL.startsWith('https://') ? 90000 : 4000,
  onSlow?: () => void,
): Promise<void> {
  const started = Date.now();
  const slow = setTimeout(() => onSlow?.(), 2500);
  try {
    for (;;) {
      try {
        await apiGet<HealthResponse>('/health', 20000);
        return;
      } catch (err) {
        if (Date.now() - started > maxMs) throw err;
        await new Promise((r) => setTimeout(r, 2000));
      }
    }
  } finally {
    clearTimeout(slow);
  }
}
