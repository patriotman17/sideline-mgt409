import { API_BASE_URL } from './config';
import { apiGet } from './http';

export interface HealthResponse {
  status: 'ok';
  service: string;
  version: string;
  environment: string;
}

// Not `/health`: some privacy/tracker blockers refuse browser requests to that path (same check, other name).
const STATUS_PATH = '/api/v1/status';

export const getBackendHealth = () => apiGet<HealthResponse>(STATUS_PATH, 8000);

/**
 * Wait for the backend to answer, for up to `maxMs`. Free hosting (Render) puts an idle server to
 * sleep and the first request wakes it, which can take 30-60 s; normal timeouts would fail first.
 * `onSlow` fires once if the first try doesn't answer quickly (so the UI can say it's waking up).
 * Only hosted (https) backends sleep; a local one that isn't running fails after a few seconds.
 */
export async function waitForBackend(
  maxMs = API_BASE_URL.startsWith('https://') ? 120000 : 4000,
  onSlow?: () => void,
): Promise<void> {
  const started = Date.now();
  const slow = setTimeout(() => onSlow?.(), 2500);
  try {
    for (;;) {
      try {
        await apiGet<HealthResponse>(STATUS_PATH, 20000);
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
