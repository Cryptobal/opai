"use client";

import { useEffect, useState } from "react";
import { X, Loader2, Send, AlertTriangle, Moon, Sun, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";

interface CoberturaStatus {
  coberturaNocturnaSentAt?: string | null;
  coberturaDiurnaSentAt?: string | null;
}

interface Props {
  turnoId: string;
  open: boolean;
  onClose: () => void;
  onClosed: () => void;
  onSendCobertura?: (turnoFilter: "nocturno" | "diurno") => void;
  userRole?: string;
}

export function CerrarTurnoModal({ turnoId, open, onClose, onClosed, onSendCobertura, userRole }: Props) {
  const [comments, setComments] = useState("");
  const [emails, setEmails] = useState<string[]>([]);
  const [emailInput, setEmailInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [summary, setSummary] = useState<string | null>(null);
  const [coberturaStatus, setCoberturaStatus] = useState<CoberturaStatus>({});
  const [loadingCobertura, setLoadingCobertura] = useState(false);
  const isAdmin = userRole === "owner" || userRole === "admin";

  // Fetch cobertura status when modal opens
  // Try /turno/active first (works for operator), fall back to /monitoreo (works for admin)
  useEffect(() => {
    if (!open || !turnoId) return;
    setLoadingCobertura(true);
    fetch("/api/ops/rondas/monitoreo/turno/active")
      .then((r) => r.json())
      .then((json) => {
        if (json.success && json.data?.emailSentTo) {
          setCoberturaStatus(json.data.emailSentTo as CoberturaStatus);
          return;
        }
        // Fallback for admin override — fetch from monitoreo endpoint
        return fetch("/api/ops/rondas/monitoreo")
          .then((r2) => r2.json())
          .then((json2) => {
            if (json2.activeTurno?.emailSentTo) {
              setCoberturaStatus(json2.activeTurno.emailSentTo as CoberturaStatus);
            }
          });
      })
      .catch(() => {})
      .finally(() => setLoadingCobertura(false));
  }, [open, turnoId]);

  const nocturnaEnviada = !!coberturaStatus.coberturaNocturnaSentAt;
  const diurnaEnviada = !!coberturaStatus.coberturaDiurnaSentAt;
  const ambasCoberturas = nocturnaEnviada && diurnaEnviada;

  const addEmail = () => {
    const trimmed = emailInput.trim();
    if (trimmed && trimmed.includes("@") && !emails.includes(trimmed)) {
      setEmails((prev) => [...prev, trimmed]);
      setEmailInput("");
    }
  };

  const removeEmail = (email: string) => {
    setEmails((prev) => prev.filter((e) => e !== email));
  };

  const handleClose = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/ops/rondas/monitoreo/turno/${turnoId}/close`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          operatorComments: comments || undefined,
          emailRecipients: emails.length > 0 ? emails : undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        toast.error(json.error ?? "Error cerrando turno");
        return;
      }
      setSummary(json.data.aiSummary);
      toast.success(`Turno cerrado${emails.length ? `. Reporte enviado a ${emails.length} destinatario(s).` : "."}`);
      onClosed();
    } finally {
      setSaving(false);
    }
  };

  const handleSendAndRefresh = (turno: "nocturno" | "diurno") => {
    onSendCobertura?.(turno);
    // Refresh status after a short delay for the API to complete
    setTimeout(() => {
      fetch("/api/ops/rondas/monitoreo/turno/active")
        .then((r) => r.json())
        .then((json) => {
          if (json.success && json.data?.emailSentTo) {
            setCoberturaStatus(json.data.emailSentTo as CoberturaStatus);
            return;
          }
          // Fallback for admin override
          return fetch("/api/ops/rondas/monitoreo")
            .then((r2) => r2.json())
            .then((json2) => {
              if (json2.activeTurno?.emailSentTo) {
                setCoberturaStatus(json2.activeTurno.emailSentTo as CoberturaStatus);
              }
            });
        })
        .catch(() => {});
    }, 3000);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Cerrar turno de monitoreo</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Cobertura enforcement */}
          {!loadingCobertura && !ambasCoberturas && (
            <div className="rounded-lg border-2 border-amber-500/40 bg-amber-500/10 p-3 space-y-2">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-400" />
                <p className="text-sm font-medium text-amber-300">Coberturas pendientes de envío</p>
              </div>
              <p className="text-xs text-amber-200/70">
                Debes enviar ambas coberturas antes de cerrar el turno.
              </p>
              <div className="flex gap-2 mt-2">
                {!nocturnaEnviada && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 text-xs gap-1.5 text-indigo-400 border-indigo-500/30 hover:bg-indigo-500/10"
                    onClick={() => handleSendAndRefresh("nocturno")}
                  >
                    <Moon className="h-3 w-3" /> Enviar nocturna
                  </Button>
                )}
                {nocturnaEnviada && (
                  <span className="inline-flex items-center gap-1 text-xs text-emerald-400">
                    <Moon className="h-3 w-3" /> Nocturna enviada
                  </span>
                )}
                {!diurnaEnviada && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 text-xs gap-1.5 text-amber-400 border-amber-500/30 hover:bg-amber-500/10"
                    onClick={() => handleSendAndRefresh("diurno")}
                  >
                    <Sun className="h-3 w-3" /> Enviar diurna
                  </Button>
                )}
                {diurnaEnviada && (
                  <span className="inline-flex items-center gap-1 text-xs text-emerald-400">
                    <Sun className="h-3 w-3" /> Diurna enviada
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Coberturas OK badge */}
          {!loadingCobertura && ambasCoberturas && (
            <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-2.5 flex items-center gap-2">
              <span className="text-emerald-400 text-xs font-medium">Coberturas enviadas</span>
              <span className="text-[10px] text-emerald-300/60 ml-auto">
                Nocturna {new Date(coberturaStatus.coberturaNocturnaSentAt!).toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" })}
                {" · "}
                Diurna {new Date(coberturaStatus.coberturaDiurnaSentAt!).toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" })}
              </span>
            </div>
          )}

          {summary ? (
            <div className="rounded-lg bg-muted p-3 text-xs whitespace-pre-wrap max-h-[200px] overflow-y-auto">
              {summary}
            </div>
          ) : (
            <div className="rounded-lg bg-muted/50 border border-border p-3 text-xs text-muted-foreground">
              El resumen se generará automáticamente al cerrar el turno.
            </div>
          )}

          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Comentarios del operador</label>
            <textarea
              className="w-full h-24 rounded-lg border border-border bg-background p-2 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-primary"
              placeholder="Novedades, incidentes o comentarios relevantes..."
              value={comments}
              onChange={(e) => setComments(e.target.value)}
            />
          </div>

          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Enviar reporte a</label>
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 mb-2">
              <span className="text-xs text-teal-400">&#9993;</span>
              <span className="text-sm text-slate-200">Operaciones (configurado en empresa)</span>
              <span className="text-[9px] text-slate-500 ml-auto">Siempre se envía</span>
            </div>
            <div className="flex gap-1.5 mb-2 flex-wrap">
              {emails.map((email) => (
                <span key={email} className="inline-flex items-center gap-1 rounded-full bg-primary/10 border border-primary/20 px-2 py-0.5 text-[11px]">
                  {email}
                  <button onClick={() => removeEmail(email)} className="text-muted-foreground hover:text-foreground">
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
            <div className="flex gap-1.5">
              <Input
                className="h-8 text-xs flex-1"
                placeholder="email@ejemplo.cl"
                value={emailInput}
                onChange={(e) => setEmailInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addEmail(); } }}
              />
              <Button type="button" size="sm" variant="outline" className="h-8 text-xs" onClick={addEmail}>
                + Agregar
              </Button>
            </div>
          </div>
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <div className="flex gap-2 flex-1">
            <Button variant="outline" onClick={onClose} disabled={saving || deleting}>Cancelar</Button>
            {isAdmin && !confirmDelete && (
              <Button
                variant="outline"
                onClick={() => setConfirmDelete(true)}
                disabled={saving || deleting}
                className="gap-1 text-red-400 border-red-500/30 hover:bg-red-500/10 hover:text-red-300"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Eliminar
              </Button>
            )}
            {isAdmin && confirmDelete && (
              <Button
                variant="destructive"
                onClick={async () => {
                  setDeleting(true);
                  try {
                    const res = await fetch(`/api/ops/rondas/monitoreo/turno/${turnoId}/close`, { method: "DELETE" });
                    const json = await res.json();
                    if (!res.ok || !json.success) {
                      toast.error(json.error ?? "Error eliminando turno");
                      return;
                    }
                    toast.success("Turno eliminado");
                    onClosed();
                  } finally {
                    setDeleting(false);
                    setConfirmDelete(false);
                  }
                }}
                disabled={deleting}
                className="gap-1"
              >
                {deleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                Confirmar eliminar
              </Button>
            )}
          </div>
          <Button
            onClick={handleClose}
            disabled={saving || deleting || (!ambasCoberturas && !loadingCobertura)}
            className="gap-1"
            title={!ambasCoberturas ? "Envía ambas coberturas primero" : undefined}
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            {saving ? "Cerrando..." : "Cerrar turno y enviar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
