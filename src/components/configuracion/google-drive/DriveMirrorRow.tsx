"use client";

import { Loader2 } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import type { PendingCount } from "@/lib/google-workspace/drive-pending-counts";

export const DOC_TYPE_LABELS: Record<string, string> = {
  cotizacion: "Cotizaciones",
  factura: "Facturas / documentos de cobro",
  licitacion: "Licitaciones",
  negocios: "Documentos de negocios",
  personas: "Documentos de contactos CRM",
  documentos: "Documentos de cuentas / instalaciones",
  leads: "Leads",
  trabajadores: "Documentos de trabajadores",
  ops_documentos: "Documentos operacionales",
};

type Props = {
  docType: string;
  enabled: boolean;
  disabled?: boolean;
  destination: string;
  pending?: PendingCount;
  counting?: boolean;
  queuedCount?: number | null;
  backfilling?: boolean;
  onToggle: (next: boolean) => void;
  onBackfill: () => void;
};

export function DriveMirrorRow({
  docType,
  enabled,
  disabled,
  destination,
  pending,
  counting,
  queuedCount,
  backfilling,
  onToggle,
  onBackfill,
}: Props) {
  const label = DOC_TYPE_LABELS[docType] ?? docType;

  return (
    <li className="space-y-2 rounded-xl border border-ds-border-subtle bg-ds-surface-1 px-3 py-3">
      <div className="flex items-center justify-between gap-3">
        <span className="text-[13px] font-medium text-ds-text-1">{label}</span>
        <Switch
          size="lg"
          checked={enabled}
          disabled={disabled}
          onCheckedChange={onToggle}
          aria-label={label}
        />
      </div>
      <p className="overflow-hidden text-ellipsis whitespace-nowrap font-mono text-[12px] text-ds-text-4">
        {destination}
      </p>
      <StatusLine
        enabled={enabled}
        counting={counting}
        pending={pending}
        queuedCount={queuedCount}
        backfilling={backfilling}
        docType={docType}
        onBackfill={onBackfill}
      />
    </li>
  );
}

function StatusLine(props: {
  enabled: boolean;
  counting?: boolean;
  pending?: PendingCount;
  queuedCount?: number | null;
  backfilling?: boolean;
  docType: string;
  onBackfill: () => void;
}) {
  const { enabled, counting, pending, queuedCount, backfilling, docType, onBackfill } =
    props;

  if (!enabled) {
    const kept = (pending?.total ?? 0) > 0;
    return (
      <p className="text-[13px] text-ds-text-3">
        {kept
          ? "Apagado. Lo que ya está en Drive se conserva."
          : "Apagado. Al activarlo se crean las carpetas y se te ofrece subir el histórico."}
      </p>
    );
  }

  if (counting || !pending) {
    return (
      <p className="text-[13px] text-ds-text-3">Contando documentos sin subir…</p>
    );
  }

  if (queuedCount != null && queuedCount > 0) {
    return (
      <p className="text-[13px] text-status-ok-fg">
        En cola · {queuedCount} documentos. Aparecen en Drive en unos minutos.
      </p>
    );
  }

  const folders = pending.pendingFolders ?? 0;
  if (docType === "licitacion" && folders > 0) {
    return (
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-[13px] text-status-warn-fg">
          {folders} licitaciones anteriores no tienen carpeta todavía
        </p>
        <Button
          size="sm"
          className="h-10 w-full sm:h-9 sm:w-auto"
          disabled={backfilling}
          onClick={onBackfill}
        >
          {backfilling ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
          Crear carpetas
        </Button>
      </div>
    );
  }

  if (pending.pending > 0) {
    return (
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-[13px] text-status-warn-fg">
          {pending.pending} documentos ya existentes no están en Drive
        </p>
        <Button
          size="sm"
          className="h-10 w-full sm:h-9 sm:w-auto"
          disabled={backfilling}
          onClick={onBackfill}
        >
          {backfilling ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
          Subirlos
        </Button>
      </div>
    );
  }

  return (
    <p className="text-[13px] text-ds-text-3">
      Al día · {pending.total} documentos
    </p>
  );
}
