import { useEffect, useState } from 'react';

/**
 * A ticking "now" for render-time comparisons (overdue, countdowns). Keeps
 * `Date.now()` out of render bodies, which the React Compiler rules forbid.
 */
export const useNow = (intervalMs = 30_000): number => {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
};
