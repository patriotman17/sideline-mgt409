import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Pressable, Text, View } from 'react-native';

import { LiveDot } from '@/components/scores/LiveDot';
import { gameStatusLabel } from '@/lib/format';
import { useHaptics } from '@/lib/haptics';
import { findGame, getTeam } from '@/services';
import { useAppActions, useAppState } from '@/state/AppStore';
import { colors, withAlpha } from '@/theme';
import type { Game, Prediction, PredictionOption } from '@/types';
import { TeamBadge } from './TeamBadge';

type Variant = 'featured' | 'card' | 'row';

/** Map an option to a team when it represents one ("away"/"home" or a team id). */
function optionTeamId(option: PredictionOption, game?: Game): string | undefined {
  if (!game) return undefined;
  if (option.id === 'away') return game.away.teamId;
  if (option.id === 'home') return game.home.teamId;
  if (option.id === game.away.teamId || option.id === game.home.teamId) return option.id;
  return undefined;
}

function usePick(prediction: Prediction) {
  const { picks } = useAppState();
  const { pick } = useAppActions();
  const { success } = useHaptics();
  const myPick = picks[prediction.id];
  const resolved = prediction.status === 'resolved';
  return {
    myPick,
    resolved,
    reveal: !!myPick || resolved,
    won: resolved && !!myPick && myPick === prediction.correctOptionId,
    choose: (optionId: string) => {
      success();
      pick(prediction.id, optionId);
    },
  };
}

function GameContext({ game }: { game?: Game }) {
  if (!game) return null;
  return (
    <View className="flex-row items-center gap-1.5">
      {game.status === 'live' ? <LiveDot size={6} /> : null}
      <Text className="text-[12px] text-sub">
        {getTeam(game.away.teamId).abbr} @ {getTeam(game.home.teamId).abbr} · {gameStatusLabel(game)}
      </Text>
    </View>
  );
}

interface OptionButtonProps {
  option: PredictionOption;
  teamId?: string;
  selected: boolean;
  correct: boolean;
  reveal: boolean;
  disabled: boolean;
  size: 'lg' | 'sm';
  onPress: () => void;
}

function OptionButton({ option, teamId, selected, correct, reveal, disabled, size, onPress }: OptionButtonProps) {
  const lg = size === 'lg';
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ selected, disabled }}
      accessibilityLabel={`${option.label}${reveal ? `, ${option.communityPct} percent of fans` : ''}`}
      className={`flex-1 items-center justify-center rounded-xl active:opacity-80 ${lg ? 'min-h-[60px] py-2.5' : 'min-h-[48px] py-1.5'} ${
        selected ? 'bg-volt' : 'bg-white/10'
      } ${correct && !selected ? 'border border-win' : ''}`}
    >
      <View className="flex-row items-center gap-2">
        {teamId && lg ? <TeamBadge teamId={teamId} size={24} /> : null}
        <Text className={`${lg ? 'text-[16px]' : 'text-[14px]'} font-semibold ${selected ? 'text-bg' : 'text-ink'}`} numberOfLines={1}>
          {option.label}
        </Text>
      </View>
      {reveal ? (
        <Text className={`font-cond ${lg ? 'text-[14px]' : 'text-[12px]'} ${selected ? 'text-bg/70' : 'text-sub'}`}>{option.communityPct}%</Text>
      ) : null}
    </Pressable>
  );
}

function Options({ prediction, game, size }: { prediction: Prediction; game?: Game; size: 'lg' | 'sm' }) {
  const { myPick, resolved, reveal, choose } = usePick(prediction);
  const stacked = prediction.options.length > 2 && size === 'lg';
  return (
    <View className={stacked ? 'gap-2' : 'flex-row gap-2'}>
      {prediction.options.map((o) => (
        <OptionButton
          key={o.id}
          option={o}
          teamId={optionTeamId(o, game)}
          selected={myPick === o.id}
          correct={resolved && prediction.correctOptionId === o.id}
          reveal={reveal}
          disabled={resolved}
          size={size}
          onPress={() => choose(o.id)}
        />
      ))}
    </View>
  );
}

/** Community split for two-way picks, in the two teams' colors when available. */
function SplitBar({ prediction, game }: { prediction: Prediction; game?: Game }) {
  if (prediction.options.length !== 2) return null;
  const [a, b] = prediction.options;
  const ta = optionTeamId(a, game);
  const tb = optionTeamId(b, game);
  return (
    <View className="mt-3">
      <View className="h-1.5 flex-row gap-0.5 overflow-hidden rounded-full">
        <View style={{ flex: a.communityPct, backgroundColor: ta ? getTeam(ta).primary : colors.ink }} />
        <View style={{ flex: b.communityPct, backgroundColor: tb ? getTeam(tb).primary : colors.raised }} />
      </View>
      <View className="mt-1 flex-row justify-between">
        <Text className="font-cond text-[13px] text-ink">{a.communityPct}%</Text>
        <Text className="text-[11px] text-mute">Community picks</Text>
        <Text className="font-cond text-[13px] text-ink">{b.communityPct}%</Text>
      </View>
    </View>
  );
}

function Footer({ prediction }: { prediction: Prediction }) {
  const { myPick, resolved, won } = usePick(prediction);
  if (resolved && myPick) {
    return (
      <Text className={`mt-3 text-[12px] font-semibold ${won ? 'text-win' : 'text-loss'}`}>
        {won ? `Correct · +${prediction.points} pts` : 'Missed this one'}
      </Text>
    );
  }
  if (myPick) return <Text className="mt-3 text-[12px] text-mute">Locked in · tap another option to change</Text>;
  return null;
}

/**
 * Free-to-play pick. `featured` is the hero on the Picks tab, `card` sits in the
 * game screen, and `row` is the compact list version.
 */
export function PredictionCard({ prediction, variant = 'card' }: { prediction: Prediction; variant?: Variant }) {
  const game = findGame(prediction.gameId);
  const { reveal } = usePick(prediction);

  if (variant === 'row') {
    return (
      <View className="px-4 py-3">
        <View className="flex-row items-start justify-between gap-3">
          <View className="flex-1">
            <Text className="text-[15px] font-semibold leading-[20px] text-ink">{prediction.question}</Text>
            <View className="mt-1">
              <GameContext game={game} />
            </View>
          </View>
          <Text className="font-cond text-[14px] text-volt">+{prediction.points}</Text>
        </View>
        <View className="mt-2.5">
          <Options prediction={prediction} game={game} size="sm" />
        </View>
        <Footer prediction={prediction} />
      </View>
    );
  }

  const away = game ? getTeam(game.away.teamId) : undefined;
  const home = game ? getTeam(game.home.teamId) : undefined;
  const body = (
    <>
      <View className="flex-row items-center justify-between">
        {variant === 'featured' ? <GameContext game={game} /> : <Text className="text-[12px] text-sub">{prediction.closesLabel}</Text>}
        <View className="flex-row items-center gap-1">
          <Ionicons name="trophy" size={11} color={colors.volt} />
          <Text className="font-cond text-[14px] text-volt">+{prediction.points} pts</Text>
        </View>
      </View>
      <Text
        className={`text-ink ${variant === 'featured' ? 'mb-5 mt-4 text-center text-[26px] font-bold leading-[31px]' : 'mb-3.5 mt-2 text-[17px] font-semibold leading-[22px]'}`}
      >
        {prediction.question}
      </Text>
      <Options prediction={prediction} game={game} size="lg" />
      {reveal ? <SplitBar prediction={prediction} game={game} /> : null}
      <Footer prediction={prediction} />
      {variant === 'featured' ? <Text className="mt-3 text-center text-[11px] text-mute">{prediction.closesLabel}</Text> : null}
    </>
  );

  if (variant === 'featured' && away && home) {
    return (
      <View className="overflow-hidden rounded-3xl">
        <LinearGradient
          colors={[withAlpha(away.primary, 0.75), '#0B0B0D', '#0B0B0D', withAlpha(home.primary, 0.7)]}
          locations={[0, 0.45, 0.55, 1]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
        />
        <View className="p-5">{body}</View>
      </View>
    );
  }
  return <View className="rounded-2xl bg-white/10 p-4">{body}</View>;
}
