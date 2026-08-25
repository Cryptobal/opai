"use client";

import { useCallback, useEffect, useState } from "react";
import { IncidenteStatusBadge } from "@/components/incidentes/IncidenteStatusBadge";
import { IncidentePhotoLightbox } from "@/components/incidentes/IncidentePhotoLightbox";
import {
  IncidenteResolverSheet,
  postSupervisionIncidenteAction,
} from "@/components/incidentes/IncidenteResolverSheet";
import { Surface } from "@/components/opai-ds";
import { Loader2 } from "lucide-react";

type Photo = { url: string; fileName: string; kind?: string };

export function IncidenteTerrenoPanel({
  ticketId,
  ticketCode,
  status,
  onDone,
}: {
  ticketId: string;
  ticketCode?: string | null;
  status: string;
  onDone?: () => void;
}) {
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [preview, setPreview] = useState<string | null>(null);
  const [resolveOpen, setResolveOpen] = useState(false);
  const [busy, setBusy] = useState<"validar" | "rechazar" | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const loadPhotos = useCallback(() => {
    fetch(`/api/ops/tickets/${ticketId}/attachments`)
      .then((r) => r.json())
      .then((j) => {
        if (!j.success || !Array.isArray(j.data)) return;
        const images = (j.data as Array<{
          url?: string;
          fileName: string;
          contentType?: string;
          kind?: string;
        }>)
          .filter((a) => a.url && (a.contentType?.startsWith("image/") || /\.(jpe?g|png|webp|gif|heic)$/i.test(a.fileName)))
          .map((a) => ({ url: a.url as string, fileName: a.fileName, kind: a.kind }));
        images.sort((a, b) => {
          if (a.kind === "report" && b.kind !== "report") return -1;
          if (b.kind === "report" && a.kind !== "report") return 1;
          return 0;
        });
        setPhotos(images);
      })
      .catch(() => {
        /* silencioso: el panel sigue accionable sin foto */
      });
  }, [ticketId]);

  useEffect(() => {
    loadPhotos();
  }, [loadPhotos]);

  const hero = photos[0] ?? null;
  const canResolve = status === "open" || status === "in_progress" || status === "waiting";
  const canValidate = status === "resolved";

  async function act(action: "validar" | "rechazar") {
    let reason = "";
    if (action === "rechazar") {
      reason = window.prompt("Motivo para devolver al guardia")?.trim() ?? "";
      if (reason.length < 4) return;
    }
    setBusy(action);
    setError("");
    try {
      await postSupervisionIncidenteAction({ ticketId, action, reason });
      setMessage(action === "validar" ? "Validado" : "Devuelto al guardia");
      onDone?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo completar");
    } finally {
      setBusy(null);
    }
  }

  return (
    <Surface padding="md" className="space-y-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-[12px] font-medium uppercase tracking-wide text-ds-text-3">
            Incidente en terreno
          </p>
          <p className="text-[13px] text-ds-text-2">
            Foto del reporte y acciones de supervisión.
          </p>
        </div>
        <IncidenteStatusBadge status={status} />
      </div>

      {hero ? (
        <button
          type="button"
          onClick={() => setPreview(hero.url)}
          className="block w-full overflow-hidden rounded-xl bg-ds-surface-2"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={hero.url}
            alt={hero.fileName}
            className="mx-auto max-h-80 w-full object-contain"
          />
        </button>
      ) : (
        <div className="flex h-44 items-center justify-center rounded-xl bg-ds-surface-2 text-[13px] text-ds-text-3">
          Sin foto de reporte
        </div>
      )}

      {photos.length > 1 ? (
        <div className="flex gap-2 overflow-x-auto">
          {photos.slice(1).map((p) => (
            <button
              key={p.url}
              type="button"
              onClick={() => setPreview(p.url)}
              className="h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-ds-surface-2"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.url} alt={p.fileName} className="h-full w-full object-contain" />
            </button>
          ))}
        </div>
      ) : null}

      {message ? (
        <p className="text-[13px] font-medium text-status-ok-fg">{message}</p>
      ) : null}
      {error ? (
        <p className="text-[13px] text-status-danger-fg">{error}</p>
      ) : null}

      {canResolve ? (
        <button
          type="button"
          className="min-h-11 w-full rounded-xl bg-primary text-sm font-semibold text-primary-foreground"
          onClick={() => setResolveOpen(true)}
        >
          Resolver
        </button>
      ) : null}

      {canValidate ? (
        <div className="flex gap-2">
          <button
            type="button"
            className="min-h-11 flex-1 rounded-xl border border-ds-border-default text-sm"
            disabled={busy !== null}
            onClick={() => void act("rechazar")}
          >
            {busy === "rechazar" ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : "Devolver"}
          </button>
          <button
            type="button"
            className="min-h-11 flex-1 rounded-xl bg-primary text-sm font-semibold text-primary-foreground"
            disabled={busy !== null}
            onClick={() => void act("validar")}
          >
            {busy === "validar" ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : "Validar"}
          </button>
        </div>
      ) : null}

      <IncidenteResolverSheet
        open={resolveOpen}
        onOpenChange={setResolveOpen}
        ticketId={ticketId}
        ticketCode={ticketCode}
        onDone={() => {
          setMessage("Resuelto y validado");
          loadPhotos();
          onDone?.();
        }}
      />
      <IncidentePhotoLightbox
        src={preview}
        open={Boolean(preview)}
        onClose={() => setPreview(null)}
      />
    </Surface>
  );
}
