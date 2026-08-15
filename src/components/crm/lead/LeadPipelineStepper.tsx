"use client";

import { JourneyStepper, LEAD_JOURNEY } from "@/components/workbench";

/**
 * LeadPipelineStepper — Nuevo → En revisión → Convertido.
 * Wrapper delgado sobre `JourneyStepper` (workbench v2) con el journey
 * canónico de Lead. Mismo API de props que la versión anterior.
 */
export function LeadPipelineStepper({
  status,
}: {
  status: string;
  firstContactAt?: Date | string | null;
}) {
  const activeIndex = status === "approved" || status === "rejected" ? 2 : status === "in_review" ? 1 : 0;

  return <JourneyStepper steps={LEAD_JOURNEY} activeIndex={activeIndex} />;
}
