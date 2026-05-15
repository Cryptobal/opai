"use client";

import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Building2, Loader2, Send, RefreshCw } from "lucide-react";
import { toast } from "sonner";

interface SendPresentationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Opcional — enriquece el borrador contextual */
  leadId?: string | null;
  contact: {
    id: string;
    firstName: string;
    lastName: string;
    email?: string | null;
    account?: {
      id: string;
      name: string;
    } | null;
  };
  installations?: Array<{
    id: string;
    name: string;
    status?: string;
  }>;
  onSent?: () => void;
}

export function SendPresentationDialog({
  open,
  onOpenChange,
  contact,
  leadId,
  installations = [],
  onSent,
}: SendPresentationDialogProps) {
  const [sending, setSending] = useState(false);
  const [notes, setNotes] = useState("");
  const [aiPrompt, setAiPrompt] = useState("");
  const [generatingNotes, setGeneratingNotes] = useState(false);
  const [selectedInstallation, setSelectedInstallation] = useState(
    installations.find((i) => i.status === "prospect")?.id || "",
  );

  const notesCacheRef = useRef<Map<string, string>>(new Map());

  const fullName = [contact.firstName, contact.lastName].filter(Boolean).join(" ");
  const prospectInstallations = useMemo(
    () => installations.filter((i) => i.status === "prospect"),
    [installations],
  );

  useEffect(() => {
    setSelectedInstallation(installations.find((i) => i.status === "prospect")?.id || "");
  }, [installations, contact.id]);

  const generateAiNotes = useCallback(
    async (customInstruction?: string) => {
      setGeneratingNotes(true);
      try {
        const payload: Record<string, string | undefined> = {
          contactId: contact.id,
          customInstruction,
        };
        if (leadId) payload.leadId = leadId;

        const instResolved =
          prospectInstallations.length > 1
            ? selectedInstallation || prospectInstallations[0]?.id || ""
            : prospectInstallations[0]?.id || "";

        if (instResolved) payload.installationId = instResolved;

        const res = await fetch("/api/ai/lead-email-body", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || "Error generando borrador");
        const body = typeof data?.data?.body === "string" ? data.data.body : "";
        setNotes(body);
        notesCacheRef.current.set(contact.id, body);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "No se pudo generar borrador IA");
      } finally {
        setGeneratingNotes(false);
      }
    },
    [contact.id, leadId, prospectInstallations, selectedInstallation],
  );

  useEffect(() => {
    if (!open) return;
    const cached = notesCacheRef.current.get(contact.id);
    if (cached !== undefined) {
      setNotes(cached);
      setAiPrompt("");
      return;
    }
    setAiPrompt("");
    void generateAiNotes();
  }, [open, contact.id, generateAiNotes]);

  const handleRegenerate = () => {
    notesCacheRef.current.delete(contact.id);
    void generateAiNotes(aiPrompt || undefined);
  };

  const handleSend = async () => {
    if (!contact.email) {
      toast.error("El contacto no tiene email.");
      return;
    }
    if (prospectInstallations.length > 1 && !selectedInstallation) {
      toast.error("Selecciona una instalación.");
      return;
    }
    setSending(true);
    try {
      const inst =
        prospectInstallations.length > 1 ? selectedInstallation : prospectInstallations[0]?.id;
      const res = await fetch(`/api/crm/contacts/${contact.id}/send-presentation`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          notes: notes.trim() || undefined,
          installationId: inst || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || "Error enviando presentación");
      }

      toast.success("Presentación enviada exitosamente");
      onOpenChange(false);
      setNotes("");
      notesCacheRef.current.delete(contact.id);
      onSent?.();
    } catch (error) {
      const message = error instanceof Error ? error.message : "No se pudo enviar";
      toast.error(message);
    } finally {
      setSending(false);
    }
  };

  const inputCn =
    "bg-background text-foreground placeholder:text-muted-foreground border-input focus-visible:ring-ring";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5 text-status-info-fg" />
            Enviar Presentación de Empresa
          </DialogTitle>
          <DialogDescription>
            Se enviará un email al contacto con acceso al portal donde podrá ver la presentación
            institucional.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs text-muted-foreground">Contacto</span>
              <span className="text-sm font-medium">{fullName}</span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs text-muted-foreground">Email</span>
              <span className="text-sm">{contact.email || "Sin email"}</span>
            </div>
            {contact.account && (
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-muted-foreground">Empresa</span>
                <span className="text-sm truncate pl-2">{contact.account.name}</span>
              </div>
            )}
          </div>

          {prospectInstallations.length > 1 && (
            <div className="space-y-1.5">
              <Label className="text-xs">Instalación</Label>
              <select
                className={`flex h-10 sm:h-9 w-full rounded-md border px-3 py-2 text-sm ${inputCn}`}
                value={selectedInstallation}
                onChange={(e) => setSelectedInstallation(e.target.value)}
                disabled={sending || generatingNotes}
              >
                <option value="">Seleccionar instalación</option>
                {prospectInstallations.map((inst) => (
                  <option key={inst.id} value={inst.id}>
                    {inst.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="space-y-1.5">
            <Label className="text-xs">Mensaje personalizado (opcional)</Label>
            {generatingNotes ? (
              <div className="flex min-h-[88px] w-full items-center justify-center rounded-md border border-border bg-muted/30 px-3">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground mr-2" />
                <span className="text-sm text-muted-foreground">Generando borrador con IA…</span>
              </div>
            ) : (
              <textarea
                value={notes}
                onChange={(e) => {
                  const v = e.target.value;
                  setNotes(v);
                  notesCacheRef.current.set(contact.id, v);
                }}
                className={`flex min-h-[88px] w-full rounded-md border px-3 py-2 text-sm resize-none ${inputCn}`}
                placeholder="Mensaje que verá el prospecto dentro del correo institucional…"
                disabled={sending}
                maxLength={500}
              />
            )}
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Prompt IA (opcional)</Label>
            <div className="flex gap-2">
              <Input
                value={aiPrompt}
                onChange={(e) => setAiPrompt(e.target.value)}
                placeholder="Ej: tono cercano; mencionar interés por la cadena nacional…"
                className={`${inputCn} h-10 sm:h-9 flex-1`}
                disabled={sending || generatingNotes}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleRegenerate();
                  }
                }}
              />
              <Button
                variant="outline"
                size="icon"
                type="button"
                className="h-10 w-10 shrink-0 sm:h-9 sm:w-9"
                onClick={handleRegenerate}
                disabled={sending || generatingNotes}
                title="Regenerar borrador IA"
              >
                <RefreshCw className={`h-4 w-4 ${generatingNotes ? "animate-spin" : ""}`} />
              </Button>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={sending}>
            Cancelar
          </Button>
          <Button
            onClick={handleSend}
            disabled={
              sending ||
              generatingNotes ||
              !contact.email ||
              (prospectInstallations.length > 1 && !selectedInstallation)
            }
          >
            {sending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Send className="mr-2 h-4 w-4" />
            )}
            Enviar Presentación
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
