'use client';

import { useCallback, useEffect, useState } from 'react';

/**
 * Client-side countdown after a 429. The server stays the authority (it keeps refusing until the window ends); this
 * only stops the customer from pressing a button that cannot work yet, and shows how long to wait.
 */
export function useCooldown() {
  const [until, setUntil] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (until === null) return;
    const timer = setInterval(() => {
      const current = Date.now();
      setNow(current);
      if (current >= until) setUntil(null);
    }, 1_000);
    return () => clearInterval(timer);
  }, [until]);
  const start = useCallback((seconds: number | undefined) => {
    if (!seconds) return;
    setNow(Date.now());
    setUntil(Date.now() + seconds * 1_000);
  }, []);
  const remaining = until === null ? 0 : Math.max(0, Math.ceil((until - now) / 1_000));
  return { remaining, active: remaining > 0, start };
}
