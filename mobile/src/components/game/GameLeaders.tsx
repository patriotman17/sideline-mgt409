import { Text, View } from 'react-native';

import { Card } from '@/components/ui';
import type { GameLeader } from '@/types';
import { TeamBadge } from './TeamBadge';

export function GameLeaders({ leaders }: { leaders: GameLeader[] }) {
  if (!leaders.length) return null;
  return (
    <Card className="bg-white/10 px-4 py-1">
      {leaders.map((l, i) => (
        <View key={`${l.player}-${l.category}`} className={`flex-row items-center py-2.5 ${i ? 'border-t border-white/10' : ''}`}>
          <TeamBadge teamId={l.teamId} size={28} />
          <View className="ml-3 flex-1">
            <Text className="text-sm font-bold text-ink">{l.player}</Text>
            <Text className="font-cond text-[14px] text-sub">{l.line}</Text>
          </View>
          <Text className="text-[12px] text-mute">{l.category}</Text>
        </View>
      ))}
    </Card>
  );
}
