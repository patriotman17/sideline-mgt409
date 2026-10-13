import { Ionicons } from '@expo/vector-icons';
import { Pressable, Text, View } from 'react-native';

import { TeamBadge } from '@/components/game';
import { MAX_FAVORITE_TEAMS, toggleFavorite } from '@/lib/account';
import { useHaptics } from '@/lib/haptics';
import { getTeam, listTeams } from '@/services';
import { colors } from '@/theme';

interface Props {
  value: string[];
  onChange: (teamIds: string[]) => void;
  /** Primary favorite (must be one of `value`). Shown as a ★ row above the grid when provided. */
  primary?: string | null;
  onPrimaryChange?: (teamId: string | null) => void;
}

const DIVISIONS = ['East', 'North', 'South', 'West'];

/** All 32 teams grouped by conference and division; tap to follow (up to 8). */
export function TeamPicker({ value, onChange, primary, onPrimaryChange }: Props) {
  const { tap } = useHaptics();
  const teams = listTeams();
  const full = value.length >= MAX_FAVORITE_TEAMS;
  return (
    <View className="gap-5">
      <Text className="text-[13px] text-mute" accessibilityLiveRegion="polite">
        {value.length
          ? `${value.length} of ${MAX_FAVORITE_TEAMS} selected`
          : `Pick up to ${MAX_FAVORITE_TEAMS} teams`}
        {value.length ? ` · ${value.map((id) => getTeam(id).abbr).join(', ')}` : ''}
      </Text>
      {onPrimaryChange && value.length ? (
        <View className="gap-2.5 rounded-2xl bg-surface p-4">
          <Text className="text-[13px] font-semibold text-sub">Your #1 team</Text>
          <View className="flex-row flex-wrap gap-2" accessibilityRole="radiogroup">
            {value.map((id) => {
              const t = getTeam(id);
              const selected = primary === id;
              return (
                <Pressable
                  key={id}
                  onPress={() => {
                    tap();
                    onPrimaryChange(id);
                  }}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                  accessibilityLabel={`Make the ${t.name} your number one team`}
                  className={`flex-row items-center gap-1.5 rounded-full px-3 py-1.5 active:opacity-80 ${
                    selected ? 'bg-ink' : 'bg-white/10'
                  }`}
                >
                  <Ionicons
                    name={selected ? 'star' : 'star-outline'}
                    size={13}
                    color={selected ? colors.bg : colors.sub}
                  />
                  <Text
                    className={`text-[13px] font-semibold ${selected ? 'text-bg' : 'text-ink'}`}
                  >
                    {t.abbr}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <Text className="text-[12px] text-mute">Shown first across Sideline.</Text>
        </View>
      ) : null}
      {(['AFC', 'NFC'] as const).map((conf) => (
        <View key={conf} className="gap-3">
          <Text className="text-[13px] font-semibold uppercase tracking-[1px] text-sub">
            {conf}
          </Text>
          {DIVISIONS.map((div) => (
            <View key={div} className="flex-row flex-wrap gap-2">
              {teams
                .filter((t) => t.division === `${conf} ${div}`)
                .map((t) => {
                  const selected = value.includes(t.id);
                  const disabled = !selected && full;
                  return (
                    <Pressable
                      key={t.id}
                      disabled={disabled}
                      onPress={() => {
                        tap();
                        const next = toggleFavorite(value, t.id);
                        onChange(next);
                        // Keep the primary valid: first pick becomes #1; unpicking #1 moves it on.
                        if (onPrimaryChange && (!primary || !next.includes(primary)))
                          onPrimaryChange(next[0] ?? null);
                      }}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: selected, disabled }}
                      accessibilityLabel={`${t.city} ${t.name}`}
                      className={`w-[48%] flex-row items-center gap-2.5 rounded-2xl px-3 py-2.5 active:opacity-80 ${
                        selected
                          ? 'border border-volt bg-volt/10'
                          : 'border border-transparent bg-surface'
                      } ${disabled ? 'opacity-40' : ''}`}
                    >
                      <TeamBadge teamId={t.id} size={32} />
                      <View className="flex-1">
                        <Text className="text-[14px] font-semibold text-ink" numberOfLines={1}>
                          {t.name}
                        </Text>
                        <Text className="text-[11px] text-mute">{t.abbr}</Text>
                      </View>
                      {selected ? (
                        <Ionicons name="checkmark-circle" size={18} color={colors.volt} />
                      ) : null}
                    </Pressable>
                  );
                })}
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}
