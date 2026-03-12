"use client";

import { useEffect, useState } from "react";
import { Plus, X, Send, Loader2, Camera } from "lucide-react";
import { toast } from "sonner";
import { SupervisorInstallation } from "@/lib/portal-supervisor";

interface Props {
  installations: SupervisorInstallation[];
  defaultInstallationId?: string;
  /** Increment this value to programmatically open the form */
  openTrigger?: number;
}

export function SupervisorNovedadRapida({ installations, defaultInstallationId, openTrigger }: Props) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (openTrigger) setOpen(true);
  }, [openTrigger]);
  const [installationId, setInstallationId] = useState(
    defaultInstallationId ?? installations[0]?.id ?? ""
  );
  const [content, setContent] = useState("");
  const [noteType, setNoteType] = useState<"GENERAL" | "ALERT">("GENERAL");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    if (!installationId || !content.trim()) {
      toast.error("Completa la instalación y el contenido.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/portal/supervisor/novedades", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ installationId, content: content.trim(), noteType }),
      });
      const json = await res.json();
      if (json.success) {
        toast.success("Novedad registrada");
        setContent("");
        setNoteType("GENERAL");
        setOpen(false);
      } else {
        toast.error(json.error ?? "Error al registrar");
      }
    } catch {
      toast.error("Error de conexión");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      {/* FAB */}
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-20 right-4 z-40 w-14 h-14 rounded-full bg-amber-600 text-white shadow-lg shadow-amber-900/50 flex items-center justify-center hover:bg-amber-500 transition-colors"
        aria-label="Registrar novedad rápida"
      >
        <Plus size={24} />
      </button>

      {/* Sheet/Modal */}
      {open && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setOpen(false)}
          />

          {/* Panel */}
          <div className="relative bg-zinc-950 border-t border-zinc-800 rounded-t-2xl p-4 pb-safe flex flex-col gap-4">
            {/* Header */}
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold">Novedad rápida</h3>
              <button
                onClick={() => setOpen(false)}
                className="p-2 rounded-lg text-zinc-500 hover:text-zinc-300"
              >
                <X size={18} />
              </button>
            </div>

            {/* Installation */}
            {installations.length > 1 && (
              <select
                value={installationId}
                onChange={(e) => setInstallationId(e.target.value)}
                className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-amber-500"
              >
                {installations.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.name}
                  </option>
                ))}
              </select>
            )}

            {/* Type toggle */}
            <div className="flex gap-2">
              {(["GENERAL", "ALERT"] as const).map((type) => (
                <button
                  key={type}
                  onClick={() => setNoteType(type)}
                  className={`flex-1 py-2 rounded-lg text-xs font-medium transition-colors ${
                    noteType === type
                      ? type === "ALERT"
                        ? "bg-red-600 text-white"
                        : "bg-zinc-700 text-white"
                      : "bg-zinc-900 text-zinc-500 border border-zinc-800"
                  }`}
                >
                  {type === "GENERAL" ? "General" : "Alerta"}
                </button>
              ))}
            </div>

            {/* Content */}
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Describe la novedad..."
              rows={4}
              className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2.5 text-sm text-white placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-amber-500 resize-none"
              autoFocus
            />

            {/* Actions */}
            <div className="flex gap-2">
              <button
                onClick={handleSubmit}
                disabled={submitting || !content.trim()}
                className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-amber-600 text-white font-medium text-sm hover:bg-amber-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {submitting ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <Send size={16} />
                )}
                {submitting ? "Registrando..." : "Registrar novedad"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
