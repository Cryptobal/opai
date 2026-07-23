"use client";

import { AgendaDesktop } from "./desktop/AgendaDesktop";
import { AgendaMobile } from "./mobile/AgendaMobile";
import { useIsMobileAgenda } from "./mobile/agenda-mobile-utils";

/** Switch responsive: móvil (<lg) y desktop (≥lg) son experiencias separadas. */
export function AgendaPageClient() {
  const isMobile = useIsMobileAgenda();
  if (isMobile) return <AgendaMobile />;
  return <AgendaDesktop />;
}
