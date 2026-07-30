"use client";

/**
 * Auditoría consolidada: eventos del bundle y de todas sus cotizaciones hijas.
 * Se refresca en vivo tras cada acción (`refreshKey`).
 */

import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { Surface, Skeleton, Tag } from "@/components/opai-ds";
import { Button } from "@/components/ui/button";
import { CrmActivityTimeline } from "@/components/crm/CrmActivityTimeline";

type BundleActivityEvent = {
  id: string;
  action: string;
  details?: Record<string, unknown> | null;
  scope: "propuesta" | "instalación";
  scopeLabel: string;
  createdAt: string;
  createdBy?: string | null;
  createdByName?: string | null;
};

export function BundleAuditSection({
  bundleId,
  refreshKey,
}: {
  bundleId: string;
  /** Cambia tras cada acción para recargar la auditoría. */
  refreshKey: unknown;
}) {
  const [events, setEvents] = useState<BundleActivityEvent[] | null>(null);
  const [reloading, setReloading] = useState(false);
  const [manualReload, setManualReload] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setReloading(true);
    fetch(`/api/cpq/bundles/${bundleId}/activity`)
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => {
        if (cancelled) return;
        setEvents(json?.success ? (json.data as BundleActivityEvent[]) : []);
      })
      .catch(() => {
        if (!cancelled) setEvents([]);
      })
      .finally(() => {
        if (!cancelled) setReloading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [bundleId, refreshKey, manualReload]);

  return (
    <Surface elevation={1} padding="md" className="space-y-3" id="sec-auditoria-bundle">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h2 className="font-display text-base text-foreground">Auditoría</h2>
          {events && (
            <Tag variant="neutral" size="sm">
              {events.length} registro{events.length === 1 ? "" : "s"}
            </Tag>
          )}
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-10 w-10 sm:h-9 sm:w-9"
          title="Actualizar auditoría"
          onClick={() => setManualReload((n) => n + 1)}
          disabled={reloading}
        >
          <RefreshCw className={reloading ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
        </Button>
      </div>
      <p className="text-[13px] text-ds-text-3">
        Cambios de la propuesta y de todas sus instalaciones: quién, cuándo y qué se
        modificó.
      </p>
      {events === null ? (
        <Skeleton className="h-32 w-full" />
      ) : events.length === 0 ? (
        <p className="text-[13px] text-ds-text-3">Sin registros todavía.</p>
      ) : (
        <CrmActivityTimeline
          events={events.map((e) => ({
            id: e.id,
            action: e.action,
            details: { ámbito: e.scopeLabel, ...(e.details ?? {}) },
            createdAt: e.createdAt,
            createdBy: e.createdBy,
            createdByName: e.createdByName,
          }))}
        />
      )}
    </Surface>
  );
}
