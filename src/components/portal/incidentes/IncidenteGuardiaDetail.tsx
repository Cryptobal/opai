"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { DEVICE_TOKEN_KEY, safeStorage } from "@/lib/device-constants";
import { IncidenteStatusBadge } from "@/components/incidentes/IncidenteStatusBadge";
import { Siren } from "lucide-react";
import { EmptyState, Spinner, Surface } from "@/components/opai-ds";
import { MIN_CLOSURE_COMMENT_CHARS } from "@/lib/incidentes-instalacion/constants";

type Detail = {
  id: string;
  code: string;
  title: string;
  status: string;
  category: string | null;
  createdAt: string;
  respondedIn: string | null;
  resolutionNotes: string | null;
  reportPhotoUrl: string | null;
  closurePhotoUrl: string | null;
};

export function IncidenteGuardiaDetail({ id }: { id: string }) {
  const router = useRouter();
  const [item, setItem] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [sheet, setSheet] = useState(false);
  const [comment, setComment] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const token = () => safeStorage.getItem(DEVICE_TOKEN_KEY);

  const load = useCallback(() => {
    const t = token();
    if (!t) {
      setLoading(false);
      return;
    }
    fetch(`/api/portal/incidentes/${id}`, { headers: { Authorization: `Bearer ${t}` } })
      .then(async (r) => {
        const json = await r.json();
        if (!r.ok) throw new Error(json.error ?? "No encontrado");
        setItem(json.data);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Error"))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  async function atender() {
    const t = token();
    if (!t) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/portal/incidentes/${id}/atender`, {
        method: "POST",
        headers: { Authorization: `Bearer ${t}` },
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "No se pudo atender");
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setBusy(false);
    }
  }

  async function cerrar() {
    const t = token();
    if (!t || !photo || comment.trim().length < MIN_CLOSURE_COMMENT_CHARS) return;
    setBusy(true);
    setError(null);
    try {
      const urlRes = await fetch("/api/portal/incidentes/upload-url", {
        method: "POST",
        headers: { Authorization: `Bearer ${t}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          contentType: photo.type,
          fileName: photo.name,
          fileSize: photo.size,
        }),
      });
      const urlJson = await urlRes.json();
      if (!urlRes.ok) throw new Error(urlJson.error ?? "No se pudo subir la foto");
      const payload = urlJson.data ?? urlJson;
      const put = await fetch(payload.uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": photo.type },
        body: photo,
      });
      if (!put.ok) throw new Error("Fallo la subida de la foto");
      const res = await fetch(`/api/portal/incidentes/${id}/cerrar`, {
        method: "POST",
        headers: { Authorization: `Bearer ${t}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          comment: comment.trim(),
          files: [{
            storageKey: payload.storageKey,
            contentType: photo.type,
            fileName: photo.name,
            fileSize: photo.size,
          }],
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "No se pudo cerrar");
      setSheet(false);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return <div className="flex min-h-[40vh] items-center justify-center"><Spinner /></div>;
  }
  if (!item) {
    return <EmptyState icon={Siren} title="Incidente no encontrado" description={error ?? undefined} />;
  }

  return (
    <div className="ds-page-enter space-y-4 p-4 pb-28">
      <button type="button" className="text-[13px] text-ds-text-3 min-h-11" onClick={() => router.back()}>
        ← Volver
      </button>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-mono text-[12px] text-ds-text-3">{item.code}</p>
          <h1 className="font-display text-xl text-ds-text-1">{item.title}</h1>
        </div>
        <IncidenteStatusBadge status={item.status} />
      </div>
      {item.reportPhotoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={item.reportPhotoUrl} alt="Evidencia del reporte" className="w-full rounded-xl" />
      ) : null}
      {item.resolutionNotes ? (
        <Surface padding="md">
          <p className="text-[12px] uppercase tracking-wide text-ds-text-3">Comentario de cierre</p>
          <p className="mt-1 text-[14px]">{item.resolutionNotes}</p>
        </Surface>
      ) : null}
      {error ? <p className="text-status-danger-fg text-[13px]">{error}</p> : null}

      {item.status === "open" ? (
        <button
          type="button"
          className="w-full min-h-11 rounded-xl bg-primary text-primary-foreground font-semibold"
          disabled={busy}
          onClick={atender}
        >
          Atender incidente
        </button>
      ) : null}
      {item.status === "in_progress" ? (
        <button
          type="button"
          className="w-full min-h-11 rounded-xl bg-primary text-primary-foreground font-semibold"
          disabled={busy}
          onClick={() => setSheet(true)}
        >
          Cerrar incidente
        </button>
      ) : null}

      {sheet ? (
        <div className="fixed inset-0 z-50 flex items-end bg-black/35">
          <div className="w-full rounded-t-3xl bg-ds-surface-1 p-5 pb-[max(env(safe-area-inset-bottom),1.5rem)] space-y-3">
            <h2 className="font-display text-lg">Cerrar incidente</h2>
            <p className="text-[13px] text-ds-text-3">Foto y comentario son obligatorios.</p>
            <button
              type="button"
              className="flex h-24 w-full items-center justify-center rounded-xl border border-ds-border-default bg-ds-surface-2 text-[14px]"
              onClick={() => inputRef.current?.click()}
            >
              {preview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={preview} alt="" className="h-full w-full rounded-xl object-cover" />
              ) : (
                "Tomar foto de cierre"
              )}
            </button>
            <input
              ref={inputRef}
              type="file"
              accept="image/*"
              capture="environment"
              hidden
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                setPhoto(file);
                setPreview(URL.createObjectURL(file));
              }}
            />
            <textarea
              className="w-full min-h-[96px] rounded-xl border border-ds-border-default bg-ds-surface-2 p-3 text-[14px]"
              placeholder="Qué hiciste para resolverlo"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
            />
            <button
              type="button"
              className="w-full min-h-11 rounded-xl bg-primary text-primary-foreground font-semibold disabled:opacity-50"
              disabled={busy || !photo || comment.trim().length < MIN_CLOSURE_COMMENT_CHARS}
              onClick={cerrar}
            >
              {busy ? "Cerrando…" : "Confirmar cierre"}
            </button>
            <button type="button" className="w-full min-h-11 text-[14px]" onClick={() => setSheet(false)}>
              Cancelar
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
