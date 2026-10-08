// TODO(phase-3): load from Supabase once auth is in place.
import { DEFAULT_SETTINGS, MOCK_PROFILE } from '@/data/mock';
import type { UserProfile } from '@/types';

export const getSeedProfile = (): UserProfile => JSON.parse(JSON.stringify(MOCK_PROFILE));
export const getDefaultSettings = () => ({ ...DEFAULT_SETTINGS });
