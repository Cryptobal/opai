"use client";

import { useEffect, useState } from "react";

type SyncInfo = {
  syncStatus: string;
  htmlLink: string | null;
  lastError: string | null;
} | null;

/**
 * Estado del evento Google Calendar de la licitación. El sync corre async
 * tras el PATCH del deal, por eso re-consulta una vez a los 2.5s.
 */
export function LicitacionSyncBadge({ dealId, refreshKey }: { dealId: string; refreshKey: string }) {
  const [info, setInfo] = useState<SyncInfo>(null);

  useEffect(() => {
    let alive = true;
    const load = () =>
      fetch(`/api/crm/deals/${dealId}/licitacion-sync`)
        .then((r) => r.json())
        .then((j) => {
          if (alive && j.success) setInfo(j.data ?? null);
        })
        .catch(() => {});
    void load();
    const t = setTimeout(() => void load(), 2500);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [dealId, refreshKey]);

  if (!info) return null;
  if (info.syncStatus === "SYNCED") {
    return info.htmlLink ? (
      <a
        href={info.htmlLink}
        target="_blank"
        rel="noopener noreferrer"
        className="text-[12px] text-status-ok-fg underline underline-offset-2"
      >
        ✓ En Google Calendar
      </a>
    ) : (
      <span className="text-[12px] text-status-ok-fg">✓ En Google Calendar</span>
    );
  }
  if (info.syncStatus === "PENDING") {
    return (
      <a
        href="/opai/configuracion/integraciones"
        className="text-[12px] text-status-warn-fg underline underline-offset-2"
      >
        Sin sincronizar — conectar Google Calendar
      </a>
    );
  }
  if (info.syncStatus === "ERROR") {
    return (
      <span className="text-[12px] text-status-danger-fg" title={info.lastError ?? undefined}>
        Error de sincronización
      </span>
    );
  }
  return null;
}
