import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Text, View } from 'react-native';

import { LiveBadge } from '@/components/ui';
import { gameStatusLabel } from '@/lib/format';
import { getTeam } from '@/services';
import { colors, withAlpha } from '@/theme';
import type { Game, TeamScore } from '@/types';
import { FieldTracker } from './FieldTracker';
import { TeamBadge } from './TeamBadge';
import { WinProbabilityBar } from './WinProbabilityBar';

function Timeouts({ count, showFor }: { count: number; showFor: boolean }) {
  if (!showFor) return <View className="h-1.5" />;
  return (
    <View className="mt-1.5 flex-row gap-1" accessibilityLabel={`${count} timeouts remaining`}>
      {[0, 1, 2].map((i) => (
        <View key={i} className={`h-1.5 w-4 rounded-full ${i < count ? 'bg-gold' : 'bg-raised'}`} />
      ))}
    </View>
  );
}

function TeamColumn({ ts, game }: { ts: TeamScore; game: Game }) {
  const team = getTeam(ts.teamId);
  const hasBall = game.status === 'live' && game.situation?.possessionTeamId === ts.teamId;
  return (
    <View className="flex-1 items-center">
      <TeamBadge teamId={ts.teamId} size={60} />
      <View className="mt-2 flex-row items-center gap-1">
        <Text className="text-base font-extrabold text-ink">{team.abbr}</Text>
        {hasBall ? <Ionicons name="american-football" size={13} color={colors.gold} /> : null}
      </View>
      <Text className="text-[11px] text-sub">{team.record}</Text>
      <Timeouts count={ts.timeouts} showFor={game.status === 'live'} />
    </View>
  );
}

/** Live-style scoreboard at the top of the Game Detail screen. */
export function Scoreboard({ game }: { game: Game }) {
  const away = getTeam(game.away.teamId);
  const home = getTeam(game.home.teamId);
  const showScore = game.status !== 'scheduled';

  return (
    <View className="mx-4 overflow-hidden rounded-3xl border border-line">
      <LinearGradient
        colors={[withAlpha(away.primary, 0.5), colors.surface, colors.surface, withAlpha(home.primary, 0.5)]}
        locations={[0, 0.4, 0.6, 1]}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={{ paddingHorizontal: 16, paddingTop: 18, paddingBottom: 16 }}
      >
        <View className="flex-row items-center">
          <TeamColumn ts={game.away} game={game} />
          <View className="items-center px-2">
            {showScore ? (
              <View className="flex-row items-center gap-3">
                <Text className="text-[46px] font-black tabular-nums text-ink">{game.away.score}</Text>
                <Text className="text-xl font-bold text-mute">–</Text>
                <Text className="text-[46px] font-black tabular-nums text-ink">{game.home.score}</Text>
              </View>
            ) : (
              <Text className="text-2xl font-black text-ink">VS</Text>
            )}
            <View className="mt-1 flex-row items-center gap-2">
              {game.status === 'live' ? <LiveBadge compact /> : null}
              <Text className="text-xs font-bold text-sub">{gameStatusLabel(game)}</Text>
            </View>
          </View>
          <TeamColumn ts={game.home} game={game} />
        </View>

        {game.status === 'live' && game.situation ? (
          <View className="mt-5">
            <FieldTracker game={game} />
          </View>
        ) : null}

        {game.status !== 'final' ? (
          <View className="mt-5">
            <WinProbabilityBar game={game} />
          </View>
        ) : null}

        <View className="mt-4 flex-row justify-between border-t border-white/10 pt-3">
          <Meta label="Spread" value={game.spread} />
          <Meta label="O/U" value={String(game.overUnder)} />
          <Meta label="TV" value={game.network} />
        </View>
      </LinearGradient>
    </View>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <View className="items-center">
      <Text className="text-[10px] font-semibold uppercase tracking-widest text-mute">{label}</Text>
      <Text className="mt-0.5 text-[13px] font-bold text-ink">{value}</Text>
    </View>
  );
}
