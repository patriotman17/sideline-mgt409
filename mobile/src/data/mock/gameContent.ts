// MOCK DATA — fabricated play-by-play, AI insights, and prediction markets.
// The featured game (BUF @ KC) is hand-written; others use a light template.
import type { Game, Insight, Prediction, TimelineEvent } from '@/types';

const FEATURED_TIMELINE: TimelineEvent[] = [
  { id: 't1', gameId: 'g-buf-kc', period: 'Q4', clock: '5:31', type: 'touchdown', teamId: 'buf', title: 'Touchdown', description: 'J. Allen 11-yd scramble up the middle, dives over the pylon. (T. Bass kick good)', awayScore: 27, homeScore: 24 },
  { id: 't2', gameId: 'g-buf-kc', period: 'Q4', clock: '7:02', type: 'big_play', teamId: 'buf', title: 'Big Play · 34 yds', description: 'J. Allen deep left to K. Shakir, 34 yds to KC 19. Longest play of the drive.', awayScore: 20, homeScore: 24 },
  { id: 't3', gameId: 'g-buf-kc', period: 'Q4', clock: '9:47', type: 'field_goal', teamId: 'kc', title: 'Field Goal', description: 'H. Butker 44-yd field goal is GOOD.', awayScore: 20, homeScore: 24 },
  { id: 't4', gameId: 'g-buf-kc', period: 'Q4', clock: '15:00', type: 'period', title: 'Start of 4th Quarter', description: 'KC ball at their own 42 after a 3rd-down conversion.', awayScore: 20, homeScore: 21 },
  { id: 't5', gameId: 'g-buf-kc', period: 'Q3', clock: '2:18', type: 'turnover', teamId: 'buf', title: 'Interception', description: 'P. Mahomes pass intended for T. Kelce INTERCEPTED by T. Bernard at BUF 30.', awayScore: 20, homeScore: 21 },
  { id: 't6', gameId: 'g-buf-kc', period: 'Q3', clock: '6:40', type: 'touchdown', teamId: 'kc', title: 'Touchdown', description: 'P. Mahomes 22-yd pass to R. Rice in the back of the end zone. (H. Butker kick good)', awayScore: 20, homeScore: 21 },
  { id: 't7', gameId: 'g-buf-kc', period: 'Q3', clock: '11:05', type: 'penalty', teamId: 'kc', title: 'Penalty', description: 'Defensive pass interference on KC, 18 yds. Automatic first down.', awayScore: 20, homeScore: 14 },
  { id: 't8', gameId: 'g-buf-kc', period: 'Q2', clock: '0:04', type: 'field_goal', teamId: 'buf', title: 'Field Goal', description: 'T. Bass 51-yd field goal is GOOD as time expires in the half.', awayScore: 20, homeScore: 14 },
  { id: 't9', gameId: 'g-buf-kc', period: 'Q2', clock: '8:12', type: 'touchdown', teamId: 'buf', title: 'Touchdown', description: 'J. Cook 4-yd run off right tackle. (T. Bass kick good)', awayScore: 17, homeScore: 14 },
  { id: 't10', gameId: 'g-buf-kc', period: 'Q1', clock: '15:00', type: 'kickoff', title: 'Kickoff', description: 'BUF receives. Weather: 61°F, clear, wind 6 mph SW.', awayScore: 0, homeScore: 0 },
];

const FEATURED_INSIGHTS: Insight[] = [
  { id: 'i1', gameId: 'g-buf-kc', kind: 'momentum', title: 'Buffalo owns the 2nd half', body: 'BUF has scored on 4 of its last 5 drives while KC has gone three-and-out twice since the interception. Momentum swing: +18% toward Buffalo.', confidence: 82, generatedAgo: '1m ago' },
  { id: 'i2', gameId: 'g-buf-kc', kind: 'matchup', title: 'Allen vs. KC blitz', body: 'KC is blitzing on 41% of dropbacks. Allen is 9/11 for 142 yds against the blitz today — expect KC to drop into coverage on this drive.', confidence: 74, generatedAgo: '3m ago' },
  { id: 'i3', gameId: 'g-buf-kc', kind: 'trend', title: 'Clock is Buffalo’s friend', body: 'With 4:12 left and KC holding one timeout, a first down here would let BUF drain the clock under 2:00 before KC gets the ball back.', confidence: 69, generatedAgo: '1m ago' },
  { id: 'i4', gameId: 'g-buf-kc', kind: 'stat', title: 'Rice is Mahomes’ go-to', body: 'R. Rice has been targeted on 31% of KC’s 3rd downs (6 of 19). Watch for him on the next KC possession.', confidence: 77, generatedAgo: '6m ago' },
];

const FEATURED_PREDICTIONS: Prediction[] = [
  { id: 'p1', gameId: 'g-buf-kc', question: 'Does Buffalo convert this drive into points?', options: [ { id: 'td', label: 'Touchdown', communityPct: 38 }, { id: 'fg', label: 'Field Goal', communityPct: 44 }, { id: 'none', label: 'No Score', communityPct: 18 } ], points: 150, closesLabel: 'Closes next snap', status: 'open' },
  { id: 'p2', gameId: 'g-buf-kc', question: 'Who wins the game?', options: [ { id: 'buf', label: 'Bills', communityPct: 61 }, { id: 'kc', label: 'Chiefs', communityPct: 39 } ], points: 100, closesLabel: 'Closes at 2:00 warning', status: 'open' },
  { id: 'p3', gameId: 'g-buf-kc', question: 'Will the total go OVER 48.5?', options: [ { id: 'over', label: 'Over', communityPct: 72 }, { id: 'under', label: 'Under', communityPct: 28 } ], points: 75, closesLabel: 'Closes at 2:00 warning', status: 'open' },
  { id: 'p4', gameId: 'g-buf-kc', question: 'First team to score in the 3rd quarter?', options: [ { id: 'buf', label: 'Bills', communityPct: 48 }, { id: 'kc', label: 'Chiefs', communityPct: 52 } ], points: 50, closesLabel: 'Resolved', status: 'resolved', correctOptionId: 'kc' },
];

function templateTimeline(game: Game, abbr: (id: string) => string): TimelineEvent[] {
  if (game.status === 'scheduled') return [];
  const { away, home } = game;
  return [
    { id: `${game.id}-t1`, gameId: game.id, period: game.period ?? 'Q1', clock: game.clock ?? '0:00', type: 'big_play', teamId: home.teamId, title: 'Latest', description: `${abbr(home.teamId)} drive in progress. ${game.storyline ?? ''}`.trim(), awayScore: away.score, homeScore: home.score },
    { id: `${game.id}-t2`, gameId: game.id, period: 'Q1', clock: '6:22', type: 'touchdown', teamId: away.teamId, title: 'Touchdown', description: `${abbr(away.teamId)} opens the scoring on a 9-yd pass in the flat.`, awayScore: 7, homeScore: 0 },
    { id: `${game.id}-t3`, gameId: game.id, period: 'Q1', clock: '15:00', type: 'kickoff', title: 'Kickoff', description: `${abbr(home.teamId)} kicks off at ${game.venue}.`, awayScore: 0, homeScore: 0 },
  ];
}

function templateInsights(game: Game, abbr: (id: string) => string): Insight[] {
  const fav = game.homeWinProbability >= 50 ? game.home.teamId : game.away.teamId;
  return [
    { id: `${game.id}-i1`, gameId: game.id, kind: 'trend', title: `${abbr(fav)} trending as favorite`, body: `Our model gives ${abbr(fav)} the edge (${Math.max(game.homeWinProbability, 100 - game.homeWinProbability)}%) driven by early-down efficiency and red-zone defense.`, confidence: 66, generatedAgo: '4m ago' },
    { id: `${game.id}-i2`, gameId: game.id, kind: 'matchup', title: 'Trenches decide this one', body: `Both offensive lines rank top-12 in pass-block win rate. Pressure rate on 3rd down is the key stat to watch.`, confidence: 61, generatedAgo: '9m ago' },
  ];
}

function templatePredictions(game: Game, abbr: (id: string) => string): Prediction[] {
  const status = game.status === 'final' ? 'resolved' : 'open';
  // Final games have a decided win probability; show a neutral community split instead.
  const homePct = game.status === 'final' ? 47 : game.homeWinProbability;
  const winner = game.status === 'final' ? (game.home.score > game.away.score ? 'home' : 'away') : undefined;
  return [
    { id: `${game.id}-p1`, gameId: game.id, question: 'Who wins the game?', options: [ { id: 'away', label: abbr(game.away.teamId), communityPct: 100 - homePct }, { id: 'home', label: abbr(game.home.teamId), communityPct: homePct } ], points: 100, closesLabel: game.status === 'final' ? 'Resolved' : game.status === 'live' ? 'Closes at 2:00 warning' : `Closes at kickoff`, status, correctOptionId: winner },
    { id: `${game.id}-p2`, gameId: game.id, question: `Total points over ${game.overUnder}?`, options: [ { id: 'over', label: 'Over', communityPct: 57 }, { id: 'under', label: 'Under', communityPct: 43 } ], points: 75, closesLabel: game.status === 'final' ? 'Resolved' : 'Closes at halftime', status, correctOptionId: game.status === 'final' ? (game.home.score + game.away.score > game.overUnder ? 'over' : 'under') : undefined },
  ];
}

export function buildMockGameContent(game: Game, abbr: (id: string) => string) {
  if (game.id === 'g-buf-kc') {
    return { timeline: FEATURED_TIMELINE, insights: FEATURED_INSIGHTS, predictions: FEATURED_PREDICTIONS };
  }
  return {
    timeline: templateTimeline(game, abbr),
    insights: templateInsights(game, abbr),
    predictions: templatePredictions(game, abbr),
  };
}

/** Canned assistant replies keyed by intent. Replaced by a Pydantic AI agent later. */
export const MOCK_ASSISTANT_REPLIES: { match: RegExp; reply: (game: Game, abbr: (id: string) => string) => string }[] = [
  {
    match: /win|winner|predict|who.*(take|beat)/i,
    reply: (g, a) => `Right now the model leans ${a(g.homeWinProbability >= 50 ? g.home.teamId : g.away.teamId)} at ${Math.max(g.homeWinProbability, 100 - g.homeWinProbability)}%. That number moves fast late in games — a single first down can swing it 8–10 points.`,
  },
  {
    match: /4th|fourth|go for it|punt/i,
    reply: () => 'On 4th-and-short between the 35s, the go-for-it call adds roughly +3% win probability on average versus punting. Aggressive coaches have been rewarded this season.',
  },
  {
    match: /fantasy|points|start|sit/i,
    reply: (g, a) => `For fantasy, the volume is with ${a(g.away.teamId)}’s backfield today. If you’re deciding on a flex for next week, target players with red-zone usage over yards — it’s been more predictive this season.`,
  },
  {
    match: /stat|leader|yards|passing|rushing/i,
    reply: (g) => g.leaders?.length ? `Top performers so far: ${g.leaders.map((l) => `${l.player} (${l.line})`).join('; ')}.` : 'Box score leaders will show up here once the game gets going.',
  },
  {
    match: /explain|rule|why|what is/i,
    reply: () => 'Happy to explain! Ask me about any play, penalty, or rule — for example “why was that pass interference?” or “what’s a two-point conversion?”.',
  },
];

export const MOCK_ASSISTANT_FALLBACK = (g: Game, a: (id: string) => string) =>
  `Good question. ${a(g.away.teamId)} vs ${a(g.home.teamId)} is ${g.status === 'live' ? `in the ${g.period} with ${g.clock} left` : g.status === 'final' ? 'final' : `set for ${g.kickoffLabel}`}. Try asking me who’s winning the matchup, key stats, or what to expect on the next drive.`;

export const MOCK_ASSISTANT_SUGGESTIONS = [
  'Who’s going to win?',
  'Key stats so far',
  'Should they go for it on 4th?',
  'Fantasy takeaways',
];
