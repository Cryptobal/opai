"use client";

import { useEffect, useRef } from "react";

export type VisibilityAwareIntervalMeta = {
  /** True when this tick is the single catch-up run after returning to foreground. */
  isCatchUp: boolean;
};

/**
 * setInterval that suspends while `document.visibilityState !== "visible"`.
 * On return to visible, runs at most one catch-up if `minCatchUpGapMs` elapsed
 * since the last execution, then reschedules the interval.
 */
export function useVisibilityAwareInterval(
  callback: (meta?: VisibilityAwareIntervalMeta) => void | Promise<void>,
  intervalMs: number,
  options?: {
    runOnMount?: boolean;
    minCatchUpGapMs?: number;
    enabled?: boolean;
  },
): void {
  const runOnMount = options?.runOnMount ?? true;
  const minCatchUpGapMs = options?.minCatchUpGapMs ?? intervalMs;
  const enabled = options?.enabled ?? true;

  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  const lastRunAtRef = useRef<number | null>(null);
  const runOnMountRef = useRef(runOnMount);
  runOnMountRef.current = runOnMount;
  const minCatchUpGapMsRef = useRef(minCatchUpGapMs);
  minCatchUpGapMsRef.current = minCatchUpGapMs;

  useEffect(() => {
    if (!enabled || typeof document === "undefined") return;

    let intervalId: ReturnType<typeof setInterval> | null = null;

    const run = (isCatchUp: boolean) => {
      lastRunAtRef.current = Date.now();
      void callbackRef.current({ isCatchUp });
    };

    const clear = () => {
      if (intervalId != null) {
        clearInterval(intervalId);
        intervalId = null;
      }
    };

    const startInterval = () => {
      clear();
      intervalId = setInterval(() => run(false), intervalMs);
    };

    const onVisible = () => {
      const last = lastRunAtRef.current;
      const gap = last == null ? Number.POSITIVE_INFINITY : Date.now() - last;
      if (gap >= minCatchUpGapMsRef.current) {
        run(true);
      }
      startInterval();
    };

    if (document.visibilityState === "visible") {
      if (runOnMountRef.current) {
        run(false);
      }
      startInterval();
    }

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        onVisible();
      } else {
        clear();
      }
    };

    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      clear();
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [intervalMs, enabled]);
}
