/**
 * Central animation tokens and utilities.
 * All durations in ms. Respect prefers-reduced-motion.
 */

export const ANIM = {
  durationFast: 150,
  durationNormal: 200,
  durationMedium: 300,
  durationCountUp: 1000,
  staggerStep: 50,
  easing: 'cubic-bezier(0.25, 0.1, 0.25, 1)',
  easingOut: 'cubic-bezier(0.33, 1, 0.68, 1)',
} as const;

export function getPrefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Animate a number from 0 (or fromValue) to target over duration using rAF.
 * Respects prefers-reduced-motion (returns target immediately).
 * Returns cleanup function.
 * @param decimals - 0 for integer, 1 for one decimal place (e.g. percentages).
 */
export function countUp(
  onUpdate: (value: number) => void,
  target: number,
  options: { duration?: number; fromValue?: number; decimals?: number } = {}
): () => void {
  const { duration = ANIM.durationCountUp, fromValue = 0, decimals = 0 } = options;
  if (getPrefersReducedMotion()) {
    onUpdate(target);
    return () => {};
  }
  const startTime = performance.now();
  let rafId: number;
  const factor = decimals <= 0 ? 1 : Math.pow(10, decimals);

  const tick = (now: number) => {
    const elapsed = now - startTime;
    const t = Math.min(elapsed / duration, 1);
    const eased = 1 - (1 - t) * (1 - t); // ease-out quad
    const value = fromValue + (target - fromValue) * eased;
    const rounded = decimals <= 0 ? Math.round(value) : Math.round(value * factor) / factor;
    onUpdate(rounded);
    if (t < 1) rafId = requestAnimationFrame(tick);
  };

  rafId = requestAnimationFrame(tick);
  return () => cancelAnimationFrame(rafId);
}

/**
 * Compute stagger delay in ms for index (for CSS animation-delay or inline style).
 */
export function staggerDelay(index: number, stepMs: number = ANIM.staggerStep): number {
  return index * stepMs;
}
