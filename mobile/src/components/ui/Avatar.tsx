import { Text, View } from 'react-native';

interface AvatarProps {
  initials: string;
  color: string;
  size?: number;
  ring?: boolean;
}

export function Avatar({ initials, color, size = 36, ring = false }: AvatarProps) {
  return (
    <View
      className={`items-center justify-center rounded-full ${ring ? 'border-2 border-bg' : ''}`}
      style={{ width: size, height: size, backgroundColor: color }}
    >
      <Text className="font-bold text-bg" style={{ fontSize: size * 0.36 }}>
        {initials}
      </Text>
    </View>
  );
}

/** Overlapping avatar stack with "+N" overflow. */
export function AvatarStack({ people, max = 4, size = 28 }: { people: { id: string; initials: string; color: string }[]; max?: number; size?: number }) {
  const shown = people.slice(0, max);
  const extra = people.length - shown.length;
  return (
    <View className="flex-row items-center">
      {shown.map((p, i) => (
        <View key={p.id} style={{ marginLeft: i === 0 ? 0 : -size * 0.3 }}>
          <Avatar initials={p.initials} color={p.color} size={size} ring />
        </View>
      ))}
      {extra > 0 ? (
        <View
          className="items-center justify-center rounded-full border-2 border-bg bg-raised"
          style={{ width: size, height: size, marginLeft: -size * 0.3 }}
        >
          <Text className="text-[10px] font-bold text-sub">+{extra}</Text>
        </View>
      ) : null}
    </View>
  );
}
