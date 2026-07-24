"use client";

import { AgendaDesktop } from "./desktop/AgendaDesktop";
import { AgendaMobile } from "./mobile/AgendaMobile";
import { useIsMobileAgenda } from "./mobile/agenda-mobile-utils";

/** Switch responsive: móvil (<lg) y desktop (≥lg) son experiencias separadas. */
export function AgendaPageClient({
  currentUserId,
  userRole,
}: {
  currentUserId: string;
  userRole: string;
}) {
  const isMobile = useIsMobileAgenda();
  if (isMobile) {
    return <AgendaMobile currentUserId={currentUserId} userRole={userRole} />;
  }
  return <AgendaDesktop currentUserId={currentUserId} userRole={userRole} />;
}
