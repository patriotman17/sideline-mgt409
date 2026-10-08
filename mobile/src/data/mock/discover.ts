// MOCK DATA — fabricated headlines, stat lines, and standings.
import type { Division, Story, TrendingPlayer } from '@/types';

export const MOCK_STORIES: Story[] = [
  { id: 's1', category: 'Analysis', title: 'Why Buffalo’s second-half adjustments keep working', summary: 'A look at the motion-heavy looks that have flipped the Bills’ offense after halftime all season.', source: 'Sideline Staff', timeAgo: '12m', readMinutes: 4, teamId: 'buf' },
  { id: 's2', category: 'News', title: 'Lions activate starting LT from injured reserve', summary: 'Detroit gets a key piece of its offensive line back ahead of a division stretch.', source: 'Sideline Wire', timeAgo: '38m', readMinutes: 2, teamId: 'det' },
  { id: 's3', category: 'Fantasy', title: 'Week 6 waiver targets: five adds before Wednesday', summary: 'Two backs with rising snap shares and a tight end who just became the red-zone focal point.', source: 'Sideline Fantasy', timeAgo: '1h', readMinutes: 6 },
  { id: 's4', category: 'Highlights', title: 'Every touchdown from the 1 PM window', summary: 'The best scores from the early slate, including an OT walk-off in Chicago.', source: 'Sideline Video', timeAgo: '2h', readMinutes: 3, teamId: 'min' },
  { id: 's5', category: 'Analysis', title: 'The case for going for it more on 4th-and-2', summary: 'Win-probability models keep saying the same thing. Which coaches are listening?', source: 'Sideline Staff', timeAgo: '3h', readMinutes: 7 },
  { id: 's6', category: 'News', title: '49ers expect top receiver back for Sunday night', summary: 'San Francisco listed him as a full participant in Thursday’s walkthrough.', source: 'Sideline Wire', timeAgo: '5h', readMinutes: 2, teamId: 'sf' },
];

export const MOCK_TRENDING_PLAYERS: TrendingPlayer[] = [
  { id: 'tp1', name: 'Josh Allen', position: 'QB', teamId: 'buf', statLine: '281 YDS · 2 TD · 47 RUSH', trend: 'up', change: '+24.6 FPTS' },
  { id: 'tp2', name: 'Rashee Rice', position: 'WR', teamId: 'kc', statLine: '8 REC · 112 YDS · 1 TD', trend: 'up', change: '+21.2 FPTS' },
  { id: 'tp3', name: 'Jahmyr Gibbs', position: 'RB', teamId: 'det', statLine: '12 CAR · 81 YDS · 1 TD', trend: 'up', change: '+16.1 FPTS' },
  { id: 'tp4', name: 'Jordan Love', position: 'QB', teamId: 'gb', statLine: '176 YDS · 2 TD · 1 INT', trend: 'down', change: '-3.4 vs proj' },
];

export const MOCK_STANDINGS: Division[] = [
  { name: 'AFC East', rows: [ { teamId: 'buf', wins: 4, losses: 0, ties: 0, streak: 'W4' }, { teamId: 'mia', wins: 2, losses: 2, ties: 0, streak: 'L1' }, { teamId: 'nyj', wins: 1, losses: 3, ties: 0, streak: 'L2' }, { teamId: 'ne', wins: 1, losses: 3, ties: 0, streak: 'W1' } ] },
  { name: 'NFC North', rows: [ { teamId: 'det', wins: 3, losses: 1, ties: 0, streak: 'W2' }, { teamId: 'gb', wins: 3, losses: 1, ties: 0, streak: 'W1' }, { teamId: 'min', wins: 2, losses: 2, ties: 0, streak: 'W1' }, { teamId: 'chi', wins: 1, losses: 3, ties: 0, streak: 'L1' } ] },
];
