"use client";

import Link from "next/link";
import { MapPin, Navigation } from "lucide-react";
import type { DealInstallationRef } from "@/lib/crm/deal-installation";

/**
 * "Instalación del negocio" — la instalación de ESTE negocio (1), derivada de la
 * cotización activa (`resolveDealInstallation`). Distinta de "Instalaciones de la
 * cuenta" (N, pestaña aparte): esta es la que opera el negocio adjudicado.
 * Solo presentación; el ref se resuelve en el server.
 */
export function DealInstallationCard({ installation }: { installation: DealInstallationRef | null }) {
  const resolved = installation && installation.source !== "none" ? installation : null;

  return (
    <div className="space-y-1.5">
      <span className="text-[11px] uppercase tracking-[0.06em] text-ds-text-3">Instalación del negocio</span>

      {resolved ? (
        <div className="rounded-md border border-border/60 bg-muted/20 px-2.5 py-2">
          <div className="flex items-start gap-2">
            <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-ds-text-3" />
            <div className="min-w-0 flex-1">
              <Link
                href={`/crm/installations/${resolved.id}`}
                className="block truncate text-[13px] font-medium text-primary hover:underline"
              >
                {resolved.name}
              </Link>
              {resolved.addressText && (
                <p className="truncate text-[12px] text-ds-text-3">{resolved.addressText}</p>
              )}
            </div>
          </div>
          {resolved.mapsUrl && (
            <a
              href={resolved.mapsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 flex items-center gap-1 text-[12px] font-medium text-primary hover:underline"
            >
              <Navigation className="h-3 w-3" /> Cómo llegar
            </a>
          )}
        </div>
      ) : (
        <p className="rounded-md border border-dashed border-border/60 bg-muted/10 px-2.5 py-2 text-[12px] text-ds-text-3">
          Sin instalación asignada — se define desde la cotización activa.
        </p>
      )}
    </div>
  );
}
