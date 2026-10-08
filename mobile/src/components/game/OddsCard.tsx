import { Text, View } from 'react-native';

import { moneyline, sideSpreads } from '@/lib/odds';
import { getTeam } from '@/services';
import type { Game } from '@/types';

function Cell({ children, head }: { children: React.ReactNode; head?: boolean }) {
  return <Text className={`flex-1 text-right ${head ? 'text-[12px] text-mute' : 'font-cond text-[17px] text-ink'}`}>{children}</Text>;
}

/** Betting lines shown as information only — Sideline never takes wagers. */
export function OddsCard({ game }: { game: Game }) {
  if (game.status === 'final') return null;
  const away = getTeam(game.away.teamId);
  const home = getTeam(game.home.teamId);
  const spreads = sideSpreads(game, away.abbr);
  const rows = [
    { abbr: away.abbr, spread: spreads.away, total: `O ${game.overUnder}`, ml: moneyline(100 - game.homeWinProbability) },
    { abbr: home.abbr, spread: spreads.home, total: `U ${game.overUnder}`, ml: moneyline(game.homeWinProbability) },
  ];
  return (
    <View className="rounded-2xl bg-white/10 px-4 py-3">
      <View className="mb-1 flex-row items-baseline justify-between">
        <Text className="text-[15px] font-semibold text-ink">Odds</Text>
        <Text className="text-[11px] text-mute">Info only · Sample lines</Text>
      </View>
      <View className="mt-1 flex-row">
        <Text className="w-14 text-[12px] text-mute">Team</Text>
        <Cell head>Spread</Cell>
        <Cell head>Total</Cell>
        <Cell head>Moneyline</Cell>
      </View>
      {rows.map((r) => (
        <View key={r.abbr} className="mt-2 flex-row items-center">
          <Text className="w-14 text-[14px] font-semibold text-ink">{r.abbr}</Text>
          <Cell>{r.spread}</Cell>
          <Cell>{r.total}</Cell>
          <Cell>{r.ml}</Cell>
        </View>
      ))}
    </View>
  );
}
