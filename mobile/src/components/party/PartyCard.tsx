import { Ionicons } from '@expo/vector-icons';
import { Pressable, Text, View } from 'react-native';

import { TeamBadge } from '@/components/game';
import { LiveDot } from '@/components/scores/LiveDot';
import { Button } from '@/components/ui';
import { findGame, getTeam } from '@/services';
import { colors } from '@/theme';
import type { WatchParty } from '@/types';

interface PartyCardProps {
  party: WatchParty;
  joined: boolean;
  onJoin: () => void;
  onOpen: () => void;
}

/** A party as a grouped-list row: matchup marks, name, status, and one action. */
export function PartyCard({ party, joined, onJoin, onOpen }: PartyCardProps) {
  const game = findGame(party.gameId);
  const isLive = game?.status === 'live';
  const content = (
    <View className="flex-row items-center px-4 py-3">
      {game ? (
        <View className="mr-3 w-[52px] flex-row">
          <TeamBadge teamId={game.away.teamId} size={30} />
          <View style={{ marginLeft: -8 }}>
            <TeamBadge teamId={game.home.teamId} size={30} />
          </View>
        </View>
      ) : null}
      <View className="flex-1">
        <View className="flex-row items-center gap-1.5">
          <Text className="text-[16px] font-semibold text-ink" numberOfLines={1}>
            {party.name}
          </Text>
          {party.isPrivate ? <Ionicons name="lock-closed" size={11} color={colors.mute} /> : null}
        </View>
        <View className="mt-0.5 flex-row items-center gap-1.5">
          {isLive ? <LiveDot size={6} /> : null}
          <Text className="text-[13px] text-sub" numberOfLines={1}>
            {game ? `${getTeam(game.away.teamId).abbr} @ ${getTeam(game.home.teamId).abbr} · ` : ''}
            {party.startsLabel} · {party.members.length} watching
          </Text>
        </View>
      </View>
      {joined ? (
        <Ionicons name="chevron-forward" size={18} color={colors.mute} />
      ) : (
        <Button label="Join" size="sm" onPress={onJoin} />
      )}
    </View>
  );
  // Joined rows are fully tappable; unjoined rows keep a single Join button (no nested buttons on web).
  return joined ? (
    <Pressable onPress={onOpen} accessibilityRole="button" accessibilityLabel={`Open ${party.name}`} className="active:bg-white/5">
      {content}
    </Pressable>
  ) : (
    content
  );
}
