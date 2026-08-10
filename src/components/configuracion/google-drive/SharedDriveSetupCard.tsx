"use client";

import { useState } from "react";
import { CheckCircle2, Copy, Loader2, XCircle } from "lucide-react";
import { Surface, Tag } from "@/components/opai-ds";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SharedDriveReexportDialog } from "./SharedDriveReexportDialog";

type Check = { key: string; ok: boolean; message: string };

type Props = {
  mode: "OAUTH" | "SHARED_DRIVE";
  sharedDriveId: string | null;
  sharedDriveName: string | null;
  lastIngestAt: string | null;
  lastIngestError: string | null;
  ingestCounts: Record<string, number>;
  onChanged: () => void;
};

export function SharedDriveSetupCard(props: Props) {
  const {
    mode,
    sharedDriveId,
    sharedDriveName,
    lastIngestAt,
    lastIngestError,
    ingestCounts,
    onChanged,
  } = props;
  const [driveId, setDriveId] = useState(sharedDriveId ?? "");
  const [busy, setBusy] = useState(false);
  const [checks, setChecks] = useState<Check[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [reexportOpen, setReexportOpen] = useState(false);
  const isShared = mode === "SHARED_DRIVE";

  async function activate() {
    setBusy(true);
    setError(null);
    setChecks([]);
    try {
      const res = await fetch("/api/integrations/google-drive/shared-drive", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sharedDriveId: driveId.trim() }),
      });
      const json = await res.json();
      if (json.diagnosis?.checks) setChecks(json.diagnosis.checks);
      if (!res.ok) throw new Error(json.error || "Activación fallida");
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    } finally {
      setBusy(false);
    }
  }

  async function deactivate() {
    setBusy(true);
    try {
      const res = await fetch("/api/integrations/google-drive/shared-drive", {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("No se pudo desactivar");
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Surface elevation={1} padding="md" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-display text-base font-semibold text-ds-text-1">
            Unidad Compartida
          </p>
          <p className="text-[13px] text-ds-text-3">
            Sincronización bidireccional con cuenta de servicio
          </p>
        </div>
        <Tag variant={isShared ? "ok" : "neutral"} size="sm">
          {isShared ? "Activa" : "OAuth"}
        </Tag>
      </div>

      {isShared ? (
        <div className="space-y-2 text-[13px] text-ds-text-2">
          <p className="break-all">
            {sharedDriveName ?? "Unidad"} ·{" "}
            <span className="font-mono text-[12px]">{sharedDriveId}</span>
            {sharedDriveId && (
              <button
                type="button"
                className="ml-2 inline-flex h-10 w-10 items-center justify-center sm:h-9 sm:w-9"
                onClick={() => void navigator.clipboard.writeText(sharedDriveId)}
                aria-label="Copiar ID"
              >
                <Copy className="h-4 w-4 text-ds-text-3" />
              </button>
            )}
          </p>
          <p className="text-[12px] text-ds-text-4">
            Última ingesta:{" "}
            {lastIngestAt ? new Date(lastIngestAt).toLocaleString("es-CL") : "—"}
          </p>
          {lastIngestError && (
            <p className="text-[12px] text-status-danger-fg">{lastIngestError}</p>
          )}
          <p className="text-[12px] text-ds-text-3">
            Ingeridos: {ingestCounts.INGESTED ?? 0} · Ignorados:{" "}
            {ingestCounts.IGNORED ?? 0} · Error: {ingestCounts.ERROR ?? 0}
          </p>
          <div className="flex flex-wrap gap-2 pt-1">
            <Button
              size="sm"
              className="h-10 sm:h-9"
              onClick={() => setReexportOpen(true)}
              disabled={busy}
            >
              Re-exportar todo
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-10 sm:h-9"
              onClick={() => void deactivate()}
              disabled={busy}
            >
              Volver a OAuth
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <Input
            className="h-10 break-all font-mono text-[12px] sm:h-9"
            placeholder="ID de la Unidad Compartida"
            value={driveId}
            onChange={(e) => setDriveId(e.target.value)}
          />
          <Button
            className="h-10 sm:h-9"
            disabled={busy || driveId.trim().length < 10}
            onClick={() => void activate()}
          >
            {busy ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
            Verificar y activar
          </Button>
        </div>
      )}

      {checks.length > 0 && (
        <ul className="space-y-2">
          {checks.map((c) => (
            <li key={c.key} className="flex items-start gap-2 text-[13px]">
              {c.ok ? (
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-status-ok-fg" />
              ) : (
                <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-status-danger-fg" />
              )}
              <span className="text-ds-text-2">{c.message}</span>
            </li>
          ))}
        </ul>
      )}
      {error && <p className="text-[13px] text-status-danger-fg">{error}</p>}

      <SharedDriveReexportDialog
        open={reexportOpen}
        onOpenChange={setReexportOpen}
        onDone={(queued) => {
          setChecks([{ key: "reexport", ok: true, message: `${queued} archivo(s) encolados` }]);
          onChanged();
        }}
        onError={(msg) => setError(msg)}
      />
    </Surface>
  );
}
