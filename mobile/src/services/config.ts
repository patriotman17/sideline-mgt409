/**
 * Public, non-secret client config. Only EXPO_PUBLIC_* variables are inlined
 * into the app bundle — never put API keys here. Secrets live on the backend.
 */
export const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:8000';

/** While true, services return local mock data instead of calling the backend. */
export const USE_MOCK_DATA = true;
