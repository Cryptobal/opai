"use client";

import { Tag } from "@/components/opai-ds";
import type { InvitedVia } from "@/modules/calendar/calendar-detail";

export type RsvpParticipant = {
  responseStatus: string;
  invitedVia: InvitedVia;
};

/**
 * Badge RSVP: ✓ Va / ✗ No va / ? pendiente / ◉ Sin invitar (sin email ni Google).
 * Quien fue invitado por Admin.email (sin cuenta Google) muestra RSVP real.
 */
export function RsvpBadge({ participant }: { participant: RsvpParticipant }) {
  if (participant.invitedVia === "none") {
    return <Tag size="sm" variant="neutral">◉ Sin invitar</Tag>;
  }
  if (participant.responseStatus === "accepted") {
    return <Tag size="sm" variant="ok">✓ Va</Tag>;
  }
  if (participant.responseStatus === "declined") {
    return <Tag size="sm" variant="danger">✗ No va</Tag>;
  }
  return <Tag size="sm" variant="neutral">?</Tag>;
}
