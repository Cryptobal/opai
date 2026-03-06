'use client';

import { useEffect, useState } from 'react';

const MOBILE_BREAKPOINT = 768;

/**
 * True when viewport width is below the mobile breakpoint (e.g. phone/tablet portrait).
 * Used to show PWA prompts (notifications, update toast) only on mobile, not on desktop.
 * Defaults to false (desktop) to avoid flashing prompts on desktop before hydration.
 */
export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const m = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);
    const update = () => setIsMobile(m.matches);
    update();
    m.addEventListener('change', update);
    return () => m.removeEventListener('change', update);
  }, []);

  return isMobile;
}
