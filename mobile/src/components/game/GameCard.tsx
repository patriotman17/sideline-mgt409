import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Text, View } from 'react-native';

import { Card, LiveBadge } from '@/components/ui';
import { gameStatusLabel } from '@/lib/format';
import { getTeam } from '@/services';
import { useAppState } from '@/state/AppStore';
import { colors } from '@/theme';
import type { Game } from '@/types';
import { TeamBadge } from './TeamBadge';
import { WinProbabilityBar } from './WinProbabilityBar';

function TeamLine({ game, side, hideScore }: { game: Game; side: 'away' | 'home'; hideScore: boolean }) {
  const ts = game[side];
  const other = game[side === 'away' ? 'home' : 'away'];
  const team = getTeam(ts.teamId);
  const showScore = game.status !== 'scheduled';
  const isLoser = !hideScore && game.status === 'final' && ts.score < other.score;
  const hasBall = game.status === 'live' && game.situation?.possessionTeamId === ts.teamId;

  return (
    <View className="flex-row items-center py-1.5">
      <TeamBadge teamId={ts.teamId} size={30} />
      <View className="ml-3 flex-1">
        <View className="flex-row items-center gap-1.5">
          <Text className={`text-[15px] font-bold ${isLoser ? 'text-mute' : 'text-ink'}`}>{team.name}</Text>
          {hasBall ? <Ionicons name="american-football" size={12} color={colors.gold} /> : null}
        </View>
        <Text className="text-[11px] text-mute">{team.record}</Text>
      </View>
      {showScore ? (
        <Text className={`text-2xl font-extrabold tabular-nums ${isLoser ? 'text-mute' : 'text-ink'}`}>
          {hideScore ? '–' : ts.score}
        </Text>
      ) : null}
    </View>
  );
}

interface GameCardProps {
  game: Game;
  /** "carousel" renders a fixed-width card for horizontal lists. */
  variant?: 'carousel' | 'list';
}

export function GameCard({ game, variant = 'list' }: GameCardProps) {
  const { settings } = useAppState();
  // Spoiler shield hides final scores in lists; the game screen still shows them.
  const hideScore = settings.spoilerShield && game.status === 'final';
  const away = getTeam(game.away.teamId);
  const home = getTeam(game.home.teamId);
  return (
    <Card
      onPress={() => router.push({ pathname: '/game/[id]', params: { id: game.id } })}
      accessibilityLabel={`${away.name} at ${home.name}, ${gameStatusLabel(game)}`}
      className={`p-4 ${variant === 'carousel' ? 'w-[272px]' : ''}`}
    >
      <View className="mb-2 flex-row items-center justify-between">
        <View className="flex-row items-center gap-2">
          {game.status === 'live' ? <LiveBadge compact /> : null}
          <Text className={`text-xs font-bold ${game.status === 'live' ? 'text-ink' : 'text-sub'}`}>{gameStatusLabel(game)}</Text>
        </View>
        <Text className="text-[11px] font-semibold text-mute">{game.network}</Text>
      </View>
      <TeamLine game={game} side="away" hideScore={hideScore} />
      <TeamLine game={game} side="home" hideScore={hideScore} />
      {game.status === 'live' ? (
        <View className="mt-3">
          <WinProbabilityBar game={game} showLabel={false} />
        </View>
      ) : (
        <View className="mt-2 flex-row items-center justify-between border-t border-line pt-2.5">
          <Text className="flex-1 text-[11px] text-mute" numberOfLines={1}>
            {hideScore ? 'Spoiler shield on · tap to reveal' : game.storyline}
          </Text>
          {game.status === 'scheduled' ? (
            <Text className="ml-2 text-[11px] font-semibold text-sub">{game.spread}</Text>
          ) : null}
        </View>
      )}
    </Card>
  );
}
