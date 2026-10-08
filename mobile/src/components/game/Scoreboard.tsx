import { Text, View } from 'react-native';

import { LiveDot } from '@/components/scores/LiveDot';
import { downAndDistance, splitKickoff } from '@/lib/format';
import { getTeam } from '@/services';
import type { Game, TeamScore } from '@/types';
import { TeamBadge } from './TeamBadge';

function Timeouts({ count }: { count: number }) {
  return (
    <View className="mt-1.5 flex-row gap-1" accessibilityLabel={`${count} timeouts remaining`}>
      {[0, 1, 2].map((i) => (
        <View key={i} className={`h-1 w-3.5 rounded-full ${i < count ? 'bg-gold' : 'bg-white/20'}`} />
      ))}
    </View>
  );
}

function Side({ ts, game }: { ts: TeamScore; game: Game }) {
  const team = getTeam(ts.teamId);
  const other = ts === game.away ? game.home : game.away;
  const hasBall = game.status === 'live' && game.situation?.possessionTeamId === ts.teamId;
  const lost = game.status === 'final' && ts.score < other.score;
  return (
    <View className="flex-1 items-center">
      {game.status !== 'scheduled' ? (
        <Text className={`font-score text-[76px] leading-[80px] ${lost ? 'text-white/45' : 'text-ink'}`}>{ts.score}</Text>
      ) : null}
      <TeamBadge teamId={ts.teamId} size={44} />
      <View className="mt-1.5 flex-row items-center gap-1.5">
        <Text className="text-[15px] font-semibold text-ink">{team.name}</Text>
        {hasBall ? <View className="h-1.5 w-1.5 rounded-full bg-gold" accessibilityLabel="Has possession" /> : null}
      </View>
      <Text className="font-cond text-[13px] text-sub">{team.record}</Text>
      {game.status === 'live' ? <Timeouts count={ts.timeouts} /> : null}
    </View>
  );
}

function Status({ game }: { game: Game }) {
  if (game.status === 'live') {
    return (
      <>
        <View className="flex-row items-center gap-1.5">
          <LiveDot />
          <Text className="text-[12px] font-semibold text-live">LIVE</Text>
        </View>
        <Text className="mt-0.5 font-score-bold text-[28px] text-ink">
          {game.period} {game.clock}
        </Text>
        {game.situation ? (
          <Text className="mt-0.5 text-[12px] text-sub">
            {downAndDistance(game.situation.down, game.situation.distance)} · {game.situation.ballOn}
          </Text>
        ) : null}
      </>
    );
  }
  if (game.status === 'final') {
    return <Text className="font-score-bold text-[28px] text-ink">{game.period === 'F/OT' ? 'Final/OT' : 'Final'}</Text>;
  }
  const { day, time } = splitKickoff(game.kickoffLabel);
  return (
    <>
      <Text className="text-[12px] text-sub">{day}</Text>
      <Text className="font-score-bold text-[28px] text-ink">{time}</Text>
      <Text className="text-[12px] text-sub">{game.network}</Text>
    </>
  );
}

/** Top of the game screen: huge scores, team marks, and game state. */
export function Scoreboard({ game }: { game: Game }) {
  return (
    <View className="flex-row items-start px-2">
      <Side ts={game.away} game={game} />
      <View className={`w-[120px] items-center ${game.status === 'scheduled' ? 'pt-3' : 'pt-6'}`}>
        <Status game={game} />
      </View>
      <Side ts={game.home} game={game} />
    </View>
  );
}
