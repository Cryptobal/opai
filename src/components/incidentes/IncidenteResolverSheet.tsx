"use client";

import { useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { MIN_CLOSURE_COMMENT_CHARS } from "@/lib/incidentes-instalacion/constants";

export async function postSupervisionIncidenteAction(opts: {
  ticketId: string;
  action: "validar" | "rechazar" | "atender" | "resolver";
  comment?: string;
  reason?: string;
  file?: File | null;
}): Promise<{ id: string; status: string }> {
  const useMultipart = opts.action === "resolver" && Boolean(opts.file);
  let res: Response;
  if (useMultipart) {
    const fd = new FormData();
    fd.append("ticketId", opts.ticketId);
    fd.append("action", opts.action);
    if (opts.comment) fd.append("comment", opts.comment);
    if (opts.reason) fd.append("reason", opts.reason);
    if (opts.file) fd.append("file", opts.file);
    res = await fetch("/api/ops/supervision/incidentes", { method: "POST", body: fd });
  } else {
    res = await fetch("/api/ops/supervision/incidentes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ticketId: opts.ticketId,
        action: opts.action,
        comment: opts.comment,
        reason: opts.reason,
      }),
    });
  }
  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.success) {
    throw new Error(json?.error ?? "No se pudo completar la acción");
  }
  return json.data as { id: string; status: string };
}

export function IncidenteResolverSheet({
  open,
  onOpenChange,
  ticketId,
  ticketCode,
  onDone,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ticketId: string;
  ticketCode?: string | null;
  onDone?: () => void;
}) {
  const [comment, setComment] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  function reset() {
    setComment("");
    setFile(null);
    setError("");
    setBusy(false);
    if (inputRef.current) inputRef.current.value = "";
  }

  async function submit() {
    const trimmed = comment.trim();
    if (trimmed.length < MIN_CLOSURE_COMMENT_CHARS) {
      setError(`El comentario debe tener al menos ${MIN_CLOSURE_COMMENT_CHARS} caracteres.`);
      return;
    }
    setBusy(true);
    setError("");
    try {
      await postSupervisionIncidenteAction({
        ticketId,
        action: "resolver",
        comment: trimmed,
        file,
      });
      reset();
      onOpenChange(false);
      onDone?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo resolver");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <SheetContent side="bottom" className="rounded-t-2xl">
        <SheetHeader className="text-left">
          <SheetTitle>Resolver incidente</SheetTitle>
          <SheetDescription>
            {ticketCode ? `${ticketCode} · ` : ""}
            Cierra y valida desde supervisión. La foto es opcional.
          </SheetDescription>
        </SheetHeader>
        <div className="mt-4 space-y-3">
          <label className="block space-y-1">
            <span className="text-[12px] font-medium uppercase tracking-wide text-ds-text-3">
              Comentario
            </span>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={4}
              className="w-full rounded-xl border border-ds-border-default bg-ds-surface-1 px-3 py-2 text-[14px] text-foreground"
              placeholder="Qué se hizo en terreno o por qué se cierra"
            />
          </label>
          <label className="block space-y-1">
            <span className="text-[12px] font-medium uppercase tracking-wide text-ds-text-3">
              Foto (opcional)
            </span>
            <input
              ref={inputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/heic"
              className="block w-full text-[13px] text-ds-text-2 file:mr-3 file:rounded-lg file:border-0 file:bg-ds-surface-2 file:px-3 file:py-2 file:text-[13px]"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </label>
          {error ? (
            <p className="text-[13px] text-status-danger-fg">{error}</p>
          ) : null}
        </div>
        <SheetFooter className="mt-4 gap-2">
          <button
            type="button"
            className="min-h-11 rounded-xl border border-ds-border-default px-4 text-sm"
            disabled={busy}
            onClick={() => onOpenChange(false)}
          >
            Cancelar
          </button>
          <button
            type="button"
            className="min-h-11 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50"
            disabled={busy}
            onClick={() => void submit()}
          >
            {busy ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : "Resolver y validar"}
          </button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
