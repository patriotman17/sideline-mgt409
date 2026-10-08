import { MOCK_TEAMS } from '@/data/mock';
import type { Team } from '@/types';

// Team metadata is small, static reference data, so lookups are synchronous.
const TEAMS_BY_ID = new Map(MOCK_TEAMS.map((t) => [t.id, t]));

const UNKNOWN_TEAM: Team = {
  id: 'unknown',
  abbr: 'TBD',
  city: '',
  name: 'TBD',
  conference: 'AFC',
  division: '',
  primary: '#333B4A',
  secondary: '#6B7486',
  record: '0-0',
};

export const listTeams = (): Team[] => MOCK_TEAMS;
export const getTeam = (id: string): Team => TEAMS_BY_ID.get(id) ?? UNKNOWN_TEAM;
export const teamAbbr = (id: string) => getTeam(id).abbr;
