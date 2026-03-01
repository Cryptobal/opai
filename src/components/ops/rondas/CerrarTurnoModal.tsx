"use client";

import { useState } from "react";
import { X, Loader2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";

interface Props {
  turnoId: string;
  open: boolean;
  onClose: () => void;
  onClosed: () => void;
}

export function CerrarTurnoModal({ turnoId, open, onClose, onClosed }: Props) {
  const [comments, setComments] = useState("");
  const [emails, setEmails] = useState<string[]>([]);
  const [emailInput, setEmailInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [summary, setSummary] = useState<string | null>(null);

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

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Cerrar turno de monitoreo</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
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

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button onClick={handleClose} disabled={saving} className="gap-1">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            {saving ? "Cerrando..." : "Cerrar turno y enviar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
