import { useCallback, useEffect, useState } from 'react';

/**
 * A countdown for "send again" buttons. Supabase allows one confirmation / reset email per user
 * every 60 s, so the button waits the same amount instead of failing.
 */
export function useCooldown(seconds = 60): [remaining: number, start: () => void] {
  const [until, setUntil] = useState(0);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!until) return;
    const t = setInterval(() => {
      const n = Date.now();
      setNow(n);
      if (n >= until) setUntil(0);
    }, 1000);
    return () => clearInterval(t);
  }, [until]);

  const start = useCallback(() => {
    const n = Date.now();
    setNow(n);
    setUntil(n + seconds * 1000);
  }, [seconds]);

  return [until ? Math.max(0, Math.ceil((until - now) / 1000)) : 0, start];
}
