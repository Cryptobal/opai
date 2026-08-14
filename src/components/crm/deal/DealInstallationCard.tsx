"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import type { DealInstallationRef } from "@/lib/crm/deal-installation";

/**
 * Instalación del negocio — una línea densa. Se define desde la cotización.
 */
export function DealInstallationCard({ installation }: { installation: DealInstallationRef | null }) {
  const resolved = installation && installation.source !== "none" ? installation : null;

  return (
    <div className="flex min-h-10 items-center justify-between gap-3 py-2">
      <span className="shrink-0 text-[12px] font-medium uppercase tracking-wide text-ds-text-3">
        Instalación
      </span>
      {resolved ? (
        <Link
          href={`/crm/installations/${resolved.id}`}
          className="inline-flex min-w-0 items-center gap-1 text-right text-[13px] text-primary"
        >
          <span className="truncate">{resolved.name}</span>
          <ChevronRight className="h-4 w-4 shrink-0 text-ds-text-4" />
        </Link>
      ) : (
        <span className="text-right text-[13px] text-ds-text-3">Se define desde la cotización</span>
      )}
    </div>
  );
}
