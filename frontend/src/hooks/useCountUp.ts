import { useState, useEffect, useRef } from 'react';
import { countUp as runCountUp, getPrefersReducedMotion, ANIM } from '../utils/animations';

/**
 * Returns a value that animates from 0 (or previous value) to `value` over duration.
 * Respects prefers-reduced-motion. Cleanup on unmount.
 * @param decimals - 0 for integer, 1 for one decimal (e.g. percentages).
 */
export function useCountUp(
  value: number,
  options: { duration?: number; decimals?: number } = {}
): number {
  const [display, setDisplay] = useState(value);
  const prevValueRef = useRef(value);
  const isFirstMount = useRef(true);

  useEffect(() => {
    const target = value;
    const from = isFirstMount.current ? 0 : prevValueRef.current;
    prevValueRef.current = target;
    if (isFirstMount.current) isFirstMount.current = false;

    if (getPrefersReducedMotion()) {
      setDisplay(target);
      return () => {};
    }

    const duration = options.duration ?? ANIM.durationCountUp;
    const decimals = options.decimals ?? 0;
    const cleanup = runCountUp(setDisplay, target, { fromValue: from, duration, decimals });
    return cleanup;
  }, [value, options.duration, options.decimals]);

  return display;
}
