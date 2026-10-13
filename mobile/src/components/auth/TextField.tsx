import { Ionicons } from '@expo/vector-icons';
import { forwardRef, useState } from 'react';
import { Pressable, Text, TextInput, View, type TextInputProps } from 'react-native';

import { colors } from '@/theme';

interface Props extends Omit<TextInputProps, 'style'> {
  label: string;
  error?: string | null;
  hint?: string | null;
  /** Adds a show/hide toggle and hides the text by default. */
  password?: boolean;
  /** Text shown before the input, e.g. "@" for usernames. */
  prefix?: string;
}

export const TextField = forwardRef<TextInput, Props>(function TextField(
  { label, error, hint, password, prefix, ...input },
  ref,
) {
  const [hidden, setHidden] = useState(true);
  const [focused, setFocused] = useState(false);
  return (
    <View>
      <Text className="mb-1.5 text-[13px] font-semibold text-sub">{label}</Text>
      <View
        className={`min-h-[52px] flex-row items-center rounded-2xl bg-surface px-4 ${
          error
            ? 'border border-loss'
            : focused
              ? 'border border-volt/70'
              : 'border border-transparent'
        }`}
      >
        {prefix ? <Text className="mr-0.5 text-[16px] text-mute">{prefix}</Text> : null}
        <TextInput
          ref={ref}
          className="flex-1 py-3 text-[16px] text-ink"
          placeholderTextColor={colors.mute}
          selectionColor={colors.volt}
          secureTextEntry={password && hidden}
          autoCorrect={false}
          accessibilityLabel={label}
          onFocus={(e) => {
            setFocused(true);
            input.onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            input.onBlur?.(e);
          }}
          {...input}
        />
        {password ? (
          <Pressable
            onPress={() => setHidden((h) => !h)}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel={hidden ? 'Show password' : 'Hide password'}
          >
            <Ionicons
              name={hidden ? 'eye-outline' : 'eye-off-outline'}
              size={20}
              color={colors.sub}
            />
          </Pressable>
        ) : null}
      </View>
      {error ? (
        <Text className="mt-1.5 text-[13px] text-loss">{error}</Text>
      ) : hint ? (
        <Text className="mt-1.5 text-[13px] text-mute">{hint}</Text>
      ) : null}
    </View>
  );
});
