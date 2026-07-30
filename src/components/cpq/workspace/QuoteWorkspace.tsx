"use client";

/**
 * Workspace unificado de cotización: la cotización ES la propuesta.
 * - Modo única: todas las secciones de la cotización + botón Convertir.
 * - Modo multi (bundle con >1 hija): pestañas Consolidado + instalaciones,
 *   condiciones gobernadas a nivel propuesta. La URL no cambia.
 */

import { useRouter } from "next/navigation";
import { useState } from "react";
import { CpqQuoteDetail } from "@/components/cpq/CpqQuoteDetail";

type ActivityEvent = {
  id: string;
  action: string;
  details?: Record<string, unknown> | null;
  createdAt: string;
  createdBy?: string | null;
  createdByName?: string | null;
};

export function QuoteWorkspace({
  quoteId,
  currentUserId,
  activityEvents = [],
  defaultPortalEmailSubject,
  tenantBrandName,
  initialBundleId,
}: {
  quoteId: string;
  currentUserId?: string;
  activityEvents?: ActivityEvent[];
  defaultPortalEmailSubject?: string;
  tenantBrandName?: string;
  /** Bundle al que ya pertenece la cotización (resuelto en servidor). */
  initialBundleId: string | null;
}) {
  const router = useRouter();
  const [bundleId, setBundleId] = useState<string | null>(initialBundleId);

  return (
    <CpqQuoteDetail
      quoteId={quoteId}
      currentUserId={currentUserId}
      activityEvents={activityEvents}
      defaultPortalEmailSubject={defaultPortalEmailSubject}
      tenantBrandName={tenantBrandName}
      bundleId={bundleId}
      onConverted={(newBundleId) => {
        setBundleId(newBundleId);
        router.push(`/crm/propuestas/${newBundleId}`);
      }}
    />
  );
}
