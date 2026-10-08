import { apiGet } from './http';

export interface HealthResponse {
  status: 'ok';
  service: string;
  version: string;
  environment: string;
}

export const getBackendHealth = () => apiGet<HealthResponse>('/health', 2500);
