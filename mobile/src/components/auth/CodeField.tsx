import { EMAIL_CODE_LENGTH, normalizeCode } from '@/lib/account';
import { TextField } from './TextField';

interface Props {
  value: string;
  onChange: (code: string) => void;
  error?: string | null;
  onSubmit?: () => void;
}

/** The 8-digit code from a Sideline email. Digits only; pasted text is cleaned up. */
export function CodeField({ value, onChange, error, onSubmit }: Props) {
  return (
    <TextField
      label={`${EMAIL_CODE_LENGTH}-digit code`}
      value={value}
      onChangeText={(t) => onChange(normalizeCode(t))}
      error={error}
      placeholder={'0'.repeat(EMAIL_CODE_LENGTH)}
      keyboardType="number-pad"
      inputMode="numeric"
      autoComplete="one-time-code"
      textContentType="oneTimeCode"
      maxLength={EMAIL_CODE_LENGTH + 4}
      returnKeyType="done"
      onSubmitEditing={onSubmit}
      className="flex-1 py-3 font-score text-[24px] tracking-[6px] text-ink"
    />
  );
}
