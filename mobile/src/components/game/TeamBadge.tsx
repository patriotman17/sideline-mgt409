import { Text, View } from 'react-native';

import { getTeam } from '@/services';

interface TeamBadgeProps {
  teamId: string;
  size?: number;
}

/**
 * Team mark rendered from team colors + abbreviation. We deliberately avoid
 * official logos (licensing) — swap in licensed assets here later.
 */
export function TeamBadge({ teamId, size = 40 }: TeamBadgeProps) {
  const team = getTeam(teamId);
  return (
    <View
      className="items-center justify-center rounded-full"
      style={{
        width: size,
        height: size,
        backgroundColor: team.primary,
        borderWidth: Math.max(2, size * 0.06),
        borderColor: team.secondary,
      }}
      accessibilityLabel={`${team.city} ${team.name}`}
    >
      <Text className="font-black text-white" style={{ fontSize: size * (team.abbr.length > 2 ? 0.3 : 0.36), letterSpacing: -0.5 }}>
        {team.abbr}
      </Text>
    </View>
  );
}
