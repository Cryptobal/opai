"use client";

import { useState } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useSelectedInstallation } from "@/contexts/selected-installation-context";

interface Props {
  open: boolean;
  onClose: () => void;
}

export function SolicitarPropuestaSheet({ open, onClose }: Props) {
  const { installations, installationId } = useSelectedInstallation();
  const selectedName = installations.find((i) => i.id === installationId)?.name ?? "";
  const [need, setNeed] = useState("");
  const [place, setPlace] = useState(selectedName);
  const [comment, setComment] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "success" | "error">("idle");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (status === "sending") return;
    setStatus("sending");
    const message = [
      need.trim() && `Necesidad: ${need.trim()}`,
      place.trim() && `Instalación/comuna: ${place.trim()}`,
      comment.trim() && `Comentario: ${comment.trim()}`,
    ].filter(Boolean).join("\n");
    try {
      const res = await fetch("/api/portal/cliente/solicitar-propuesta", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message }),
      });
      const json = await res.json().catch(() => ({}));
      setStatus(res.ok && json?.success ? "success" : "error");
    } catch {
      setStatus("error");
    }
  }

  function handleOpenChange(next: boolean) {
    if (!next) {
      onClose();
      setStatus("idle");
    }
  }

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent side="bottom" surface="glass-island" overlayClassName="bg-black/35"
        className="max-h-[min(85dvh,640px)] overflow-y-auto px-4 pt-4">
        <SheetHeader className="text-left mb-4">
          <SheetTitle className="font-display text-ds-title">Solicitar propuesta</SheetTitle>
        </SheetHeader>
        {status === "success" ? (
          <div className="flex flex-col items-center text-center gap-3 py-8 pb-[max(env(safe-area-inset-bottom),1.5rem)]">
            <CheckCircle2 className="h-10 w-10 text-status-ok-fg" />
            <p className="font-display text-ds-heading text-ds-text-1">Solicitud enviada</p>
            <p className="text-ds-body text-ds-text-3 max-w-sm">
              Te contacta un ejecutivo en menos de 2 horas hábiles.
            </p>
            <button type="button" onClick={() => handleOpenChange(false)}
              className="mt-2 min-h-11 px-5 rounded-full bg-primary text-primary-foreground text-ds-body font-medium">
              Listo
            </button>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-3 pb-[max(env(safe-area-inset-bottom),1.5rem)]">
            <label className="block text-ds-caption font-medium text-ds-text-3">
              ¿Qué necesitas?
              <input required value={need} onChange={(e) => setNeed(e.target.value)}
                className="mt-1 w-full h-11 rounded-xl border border-ds-border-default bg-ds-surface-2 px-3 text-ds-body text-ds-text-1"
                placeholder="Ampliar cobertura, nueva instalación…" />
            </label>
            <label className="block text-ds-caption font-medium text-ds-text-3">
              Instalación o comuna
              <input value={place} onChange={(e) => setPlace(e.target.value)}
                className="mt-1 w-full h-11 rounded-xl border border-ds-border-default bg-ds-surface-2 px-3 text-ds-body text-ds-text-1"
                placeholder="Nombre o comuna" />
            </label>
            <label className="block text-ds-caption font-medium text-ds-text-3">
              Comentario
              <textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={3}
                className="mt-1 w-full rounded-xl border border-ds-border-default bg-ds-surface-2 px-3 py-2 text-ds-body text-ds-text-1"
                placeholder="Horarios, puestos, contexto…" />
            </label>
            {status === "error" && (
              <p className="text-ds-caption text-status-danger-fg">No se pudo enviar. Intenta de nuevo.</p>
            )}
            <button type="submit" disabled={status === "sending"}
              className="w-full min-h-11 rounded-full bg-primary text-primary-foreground font-medium text-ds-body inline-flex items-center justify-center gap-2 disabled:opacity-60">
              {status === "sending" && <Loader2 className="h-4 w-4 animate-spin" />}
              Enviar solicitud
            </button>
          </form>
        )}
      </SheetContent>
    </Sheet>
  );
}
