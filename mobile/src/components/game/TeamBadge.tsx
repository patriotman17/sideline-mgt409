import { Text, View } from 'react-native';

import { getTeam } from '@/services';

interface TeamBadgeProps {
  teamId: string;
  size?: number;
}

/**
 * Team mark rendered from team colors + abbreviation: a solid primary disc with
 * an inner secondary ring and a condensed monogram. We deliberately avoid
 * official logos (licensing) — swap in licensed assets here later.
 */
export function TeamBadge({ teamId, size = 40 }: TeamBadgeProps) {
  const team = getTeam(teamId);
  const ring = Math.max(1.5, size * 0.045);
  const inset = Math.max(2, size * 0.07);
  return (
    <View
      className="items-center justify-center rounded-full"
      style={{ width: size, height: size, backgroundColor: team.primary }}
      accessibilityLabel={`${team.city} ${team.name}`}
    >
      <View
        className="absolute rounded-full"
        style={{ top: inset, left: inset, right: inset, bottom: inset, borderWidth: ring, borderColor: team.secondary, opacity: 0.9 }}
      />
      <Text className="font-score text-white" style={{ fontSize: size * (team.abbr.length > 2 ? 0.36 : 0.44), letterSpacing: 0.2 }}>
        {team.abbr}
      </Text>
    </View>
  );
}
