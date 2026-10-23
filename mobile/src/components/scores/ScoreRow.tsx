import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { Pressable, Text, View } from 'react-native';

import { TeamBadge } from '@/components/game';
import { splitKickoff } from '@/lib/format';
import { getTeam } from '@/services';
import { usePersonalization } from '@/state/usePersonalization';
import { colors, withAlpha } from '@/theme';
import type { Game } from '@/types';
import { LiveDot } from './LiveDot';

function Side({ game, side, favorite }: { game: Game; side: 'away' | 'home'; favorite: boolean }) {
  const team = getTeam(game[side].teamId);
  const hasBall = game.status === 'live' && game.situation?.possessionTeamId === team.id;
  return (
    <View className="w-[64px] items-center">
      <View>
        <TeamBadge teamId={team.id} size={34} />
        {favorite ? (
          <View className="absolute -right-2.5 -top-1">
            <Ionicons name="star" size={10} color={colors.ink} />
          </View>
        ) : null}
      </View>
      <View className="mt-1 flex-row items-center gap-1">
        <Text className={`${team.name.length > 9 ? 'text-[11px]' : 'text-[12px]'} font-medium text-sub`} numberOfLines={1}>
          {team.name}
        </Text>
        {hasBall ? <View className="h-1.5 w-1.5 rounded-full bg-gold" accessibilityLabel="Has possession" /> : null}
      </View>
    </View>
  );
}

function Score({ value, dim, hidden }: { value: number; dim: boolean; hidden: boolean }) {
  return (
    <Text className={`w-[46px] text-center font-score text-[40px] leading-[44px] ${dim ? 'text-mute' : 'text-ink'}`}>
      {hidden ? '–' : value}
    </Text>
  );
}

function Center({ game, hideScore }: { game: Game; hideScore: boolean }) {
  if (game.status === 'live') {
    return (
      <>
        <Text className="text-[11px] font-medium text-mute">{game.network ? `NFL · ${game.network}` : 'NFL'}</Text>
        <View className="mt-0.5 flex-row items-center gap-1.5">
          <LiveDot />
          <Text className="font-score-bold text-[19px] text-ink" numberOfLines={1}>
            {game.period} {game.clock}
          </Text>
        </View>
      </>
    );
  }
  if (game.status === 'final') {
    return (
      <>
        <Text className="text-[11px] font-medium text-mute">NFL</Text>
        <Text className="mt-0.5 font-score-bold text-[19px] text-ink">Final</Text>
        {game.period === 'F/OT' ? <Text className="text-[11px] font-semibold text-sub">OT</Text> : null}
        {hideScore ? <Text className="text-[11px] text-mute">Spoiler shield</Text> : null}
      </>
    );
  }
  const { time } = splitKickoff(game.kickoffLabel);
  return (
    <>
      <Text className="text-[11px] font-medium text-mute">{game.network ? `NFL · ${game.network}` : 'NFL'}</Text>
      <Text className="mt-0.5 font-score-bold text-[20px] text-ink">{time}</Text>
      <Text className="text-[11px] text-mute">{game.spread}</Text>
    </>
  );
}

/**
 * One game in the scoreboard. The background blends from the away team's color
 * to the home team's, so a matchup is recognizable before you read it.
 */
interface ScoreRowProps {
  game: Game;
  /** Defaults to the game sheet. The synchronized week opens the game's real replay instead. */
  onPress?: () => void;
  /** Team records for scheduled games (sample data has them; real historical weeks don't). */
  showRecords?: boolean;
  /** Small lime chip under the score line, e.g. "Big moment". */
  badge?: string;
}

export function ScoreRow({ game, onPress, showRecords = true, badge }: ScoreRowProps) {
  const { favoriteTeamIds, spoilerShield } = usePersonalization();
  const away = getTeam(game.away.teamId);
  const home = getTeam(game.home.teamId);
  const scheduled = game.status === 'scheduled';
  const hideScore = spoilerShield && game.status === 'final';
  const awayLost = game.status === 'final' && !hideScore && game.away.score < game.home.score;
  const homeLost = game.status === 'final' && !hideScore && game.home.score < game.away.score;
  const fav = (id: string) => favoriteTeamIds.includes(id);

  return (
    <Pressable
      onPress={onPress ?? (() => router.push({ pathname: '/game/[id]', params: { id: game.id } }))}
      accessibilityRole="button"
      accessibilityLabel={`${away.name} ${scheduled ? '' : game.away.score} at ${home.name} ${scheduled ? '' : game.home.score}`}
      className="mx-3 mb-2 overflow-hidden rounded-2xl active:opacity-80 web:transition-transform web:duration-150 web:active:scale-[0.98]"
    >
      <LinearGradient
        colors={[withAlpha(away.primary, 0.55), colors.surface, colors.surface, withAlpha(home.primary, 0.55)]}
        locations={[0, 0.36, 0.64, 1]}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
      />
      <View className="flex-row items-center px-2 py-2.5">
        <Side game={game} side="away" favorite={fav(away.id)} />
        {scheduled ? (
          <Text className="w-[46px] text-center font-cond text-[15px] text-sub">{showRecords ? away.record : ''}</Text>
        ) : (
          <Score value={game.away.score} dim={awayLost} hidden={hideScore} />
        )}
        <View className="min-w-0 flex-1 items-center">
          <Center game={game} hideScore={hideScore} />
          {badge ? (
            <View className="mt-1 flex-row items-center gap-1 rounded-full bg-volt px-2 py-0.5">
              <Ionicons name="flash" size={10} color={colors.bg} />
              <Text className="text-[11px] font-bold uppercase text-bg">{badge}</Text>
            </View>
          ) : null}
        </View>
        {scheduled ? (
          <Text className="w-[46px] text-center font-cond text-[15px] text-sub">{showRecords ? home.record : ''}</Text>
        ) : (
          <Score value={game.home.score} dim={homeLost} hidden={hideScore} />
        )}
        <Side game={game} side="home" favorite={fav(home.id)} />
      </View>
    </Pressable>
  );
}
