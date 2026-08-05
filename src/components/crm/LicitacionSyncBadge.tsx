"use client";

import { useEffect, useState } from "react";

type SyncInfo = {
  syncStatus: string;
  htmlLink: string | null;
  lastError: string | null;
  needsGoogleConnect?: boolean;
} | null;

function SyncReasonText({
  text,
  tone,
  needsGoogleConnect,
}: {
  text: string;
  tone: "warn" | "danger";
  needsGoogleConnect: boolean;
}) {
  const className =
    tone === "warn"
      ? "text-[12px] text-status-warn-fg"
      : "text-[12px] text-status-danger-fg";
  if (needsGoogleConnect) {
    return (
      <a
        href="/opai/configuracion/integraciones"
        className={`${className} underline underline-offset-2`}
        title={text}
      >
        {text}
      </a>
    );
  }
  return (
    <span className={className} title={text}>
      {text}
    </span>
  );
}

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

  const needsGoogleConnect = info.needsGoogleConnect === true;
  if (info.syncStatus === "PENDING") {
    return (
      <SyncReasonText
        text={info.lastError ?? "Pendiente de sincronizar"}
        tone="warn"
        needsGoogleConnect={needsGoogleConnect}
      />
    );
  }
  if (info.syncStatus === "ERROR") {
    return (
      <SyncReasonText
        text={info.lastError ?? "Error de sincronización"}
        tone="danger"
        needsGoogleConnect={needsGoogleConnect}
      />
    );
  }
  return null;
}
