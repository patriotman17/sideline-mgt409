// MOCK DATA — team colors are approximations; records are fabricated (Week 5, 2026).
import type { Team } from '@/types';

export const MOCK_TEAMS: Team[] = [
  { id: 'buf', abbr: 'BUF', city: 'Buffalo', name: 'Bills', conference: 'AFC', division: 'AFC East', primary: '#00338D', secondary: '#C60C30', record: '4-0' },
  { id: 'mia', abbr: 'MIA', city: 'Miami', name: 'Dolphins', conference: 'AFC', division: 'AFC East', primary: '#008E97', secondary: '#FC4C02', record: '2-2' },
  { id: 'nyj', abbr: 'NYJ', city: 'New York', name: 'Jets', conference: 'AFC', division: 'AFC East', primary: '#125740', secondary: '#FFFFFF', record: '1-3' },
  { id: 'ne', abbr: 'NE', city: 'New England', name: 'Patriots', conference: 'AFC', division: 'AFC East', primary: '#002244', secondary: '#C60C30', record: '1-3' },
  { id: 'kc', abbr: 'KC', city: 'Kansas City', name: 'Chiefs', conference: 'AFC', division: 'AFC West', primary: '#E31837', secondary: '#FFB81C', record: '3-1' },
  { id: 'den', abbr: 'DEN', city: 'Denver', name: 'Broncos', conference: 'AFC', division: 'AFC West', primary: '#FB4F14', secondary: '#002244', record: '2-2' },
  { id: 'lac', abbr: 'LAC', city: 'Los Angeles', name: 'Chargers', conference: 'AFC', division: 'AFC West', primary: '#0080C6', secondary: '#FFC20E', record: '3-1' },
  { id: 'bal', abbr: 'BAL', city: 'Baltimore', name: 'Ravens', conference: 'AFC', division: 'AFC North', primary: '#241773', secondary: '#9E7C0C', record: '3-1' },
  { id: 'cin', abbr: 'CIN', city: 'Cincinnati', name: 'Bengals', conference: 'AFC', division: 'AFC North', primary: '#FB4F14', secondary: '#000000', record: '2-2' },
  { id: 'pit', abbr: 'PIT', city: 'Pittsburgh', name: 'Steelers', conference: 'AFC', division: 'AFC North', primary: '#FFB612', secondary: '#101820', record: '2-2' },
  { id: 'hou', abbr: 'HOU', city: 'Houston', name: 'Texans', conference: 'AFC', division: 'AFC South', primary: '#A71930', secondary: '#03202F', record: '2-2' },
  { id: 'phi', abbr: 'PHI', city: 'Philadelphia', name: 'Eagles', conference: 'NFC', division: 'NFC East', primary: '#004C54', secondary: '#A5ACAF', record: '3-1' },
  { id: 'dal', abbr: 'DAL', city: 'Dallas', name: 'Cowboys', conference: 'NFC', division: 'NFC East', primary: '#003594', secondary: '#869397', record: '2-2' },
  { id: 'was', abbr: 'WAS', city: 'Washington', name: 'Commanders', conference: 'NFC', division: 'NFC East', primary: '#5A1414', secondary: '#FFB612', record: '3-1' },
  { id: 'det', abbr: 'DET', city: 'Detroit', name: 'Lions', conference: 'NFC', division: 'NFC North', primary: '#0076B6', secondary: '#B0B7BC', record: '3-1' },
  { id: 'gb', abbr: 'GB', city: 'Green Bay', name: 'Packers', conference: 'NFC', division: 'NFC North', primary: '#203731', secondary: '#FFB612', record: '3-1' },
  { id: 'min', abbr: 'MIN', city: 'Minnesota', name: 'Vikings', conference: 'NFC', division: 'NFC North', primary: '#4F2683', secondary: '#FFC62F', record: '2-2' },
  { id: 'chi', abbr: 'CHI', city: 'Chicago', name: 'Bears', conference: 'NFC', division: 'NFC North', primary: '#C83803', secondary: '#0B162A', record: '1-3' },
  { id: 'sf', abbr: 'SF', city: 'San Francisco', name: '49ers', conference: 'NFC', division: 'NFC West', primary: '#AA0000', secondary: '#B3995D', record: '3-1' },
  { id: 'sea', abbr: 'SEA', city: 'Seattle', name: 'Seahawks', conference: 'NFC', division: 'NFC West', primary: '#002244', secondary: '#69BE28', record: '2-2' },
  { id: 'tb', abbr: 'TB', city: 'Tampa Bay', name: 'Buccaneers', conference: 'NFC', division: 'NFC South', primary: '#D50A0A', secondary: '#34302B', record: '2-2' },
  { id: 'atl', abbr: 'ATL', city: 'Atlanta', name: 'Falcons', conference: 'NFC', division: 'NFC South', primary: '#A71930', secondary: '#000000', record: '1-3' },
];
