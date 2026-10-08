import { Ionicons } from '@expo/vector-icons';
import { Text, View } from 'react-native';

import { TeamBadge } from '@/components/game';
import { AvatarStack, Button, Card, LiveBadge } from '@/components/ui';
import { findGame, getTeam } from '@/services';
import { colors } from '@/theme';
import type { WatchParty } from '@/types';

interface PartyCardProps {
  party: WatchParty;
  joined: boolean;
  active: boolean;
  onJoin: () => void;
  onOpen: () => void;
}

export function PartyCard({ party, joined, active, onJoin, onOpen }: PartyCardProps) {
  const game = findGame(party.gameId);
  const isLive = game?.status === 'live';
  return (
    <Card className={`mx-5 mb-3 p-4 ${active ? 'border-volt/60' : ''}`}>
      <View className="flex-row items-center">
        {game ? (
          <View className="mr-3 flex-row">
            <TeamBadge teamId={game.away.teamId} size={30} />
            <View style={{ marginLeft: -8 }}>
              <TeamBadge teamId={game.home.teamId} size={30} />
            </View>
          </View>
        ) : null}
        <View className="flex-1">
          <View className="flex-row items-center gap-1.5">
            <Text className="text-[15px] font-bold text-ink" numberOfLines={1}>
              {party.name}
            </Text>
            {party.isPrivate ? <Ionicons name="lock-closed" size={12} color={colors.mute} /> : null}
          </View>
          <Text className="mt-0.5 text-xs text-sub">
            {game ? `${getTeam(game.away.teamId).abbr} @ ${getTeam(game.home.teamId).abbr} · ` : ''}
            {party.startsLabel}
          </Text>
        </View>
        {isLive ? <LiveBadge compact /> : null}
      </View>
      <View className="mt-3 flex-row items-center justify-between">
        <View className="flex-row items-center gap-2">
          <AvatarStack people={party.members} size={26} />
          <Text className="text-xs text-mute">{party.members.length} watching</Text>
        </View>
        {joined ? (
          <Button label={active ? 'Viewing' : 'Open'} size="sm" variant="secondary" onPress={onOpen} icon={active ? 'eye' : 'chevron-forward'} />
        ) : (
          <Button label="Join" size="sm" onPress={onJoin} icon="add" />
        )}
      </View>
    </Card>
  );
}
