/**
 * Modal para crear cotización CPQ
 */

"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus } from "lucide-react";
import { CrmSectionCreateButton } from "@/components/crm/CrmSectionCreateButton";
import { toast } from "sonner";

interface CreateQuoteModalProps {
  onCreated?: (quoteId: string, dealQuote?: { id: string; quoteId: string }) => void;
  variant?: "modal" | "quick";
  /** Cliente pre-rellenado (cuenta). Cuando se pasa, el modal pide "Nombre del negocio" en lugar de Cliente. */
  defaultClientName?: string;
  /** Nombre del negocio pre-rellenado (ej. desde deal). */
  defaultDealName?: string;
  /** Cuenta para vincular la cotización (cuando se crea desde vista de cuenta). */
  accountId?: string;
  /** Negocio para vincular la cotización (cuando se crea desde vista de negocio). */
  dealId?: string;
  /** Instalación para vincular la cotización (cuando se crea desde vista de instalación). */
  installationId?: string;
  /** Controlled mode: when provided, use these instead of internal state (no trigger rendered) */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function CreateQuoteModal({ onCreated, variant = "modal", defaultClientName, defaultDealName, accountId, dealId, installationId, open: controlledOpen, onOpenChange: controlledOnOpenChange }: CreateQuoteModalProps) {
  const router = useRouter();
  const [internalOpen, setInternalOpen] = useState(false);
  const isControlled = controlledOpen !== undefined && controlledOnOpenChange !== undefined;
  const open = isControlled ? controlledOpen : internalOpen;
  const setOpen = isControlled ? controlledOnOpenChange! : setInternalOpen;
  const [quoteName, setQuoteName] = useState("");
  const [clientName, setClientName] = useState(defaultClientName ?? "");
  const [dealName, setDealName] = useState("");
  const [validUntil, setValidUntil] = useState("");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);

  const hasContext = Boolean(defaultClientName);

  function getDefaultValidUntil(): string {
    const d = new Date();
    d.setDate(d.getDate() + 90);
    return d.toISOString().split("T")[0] ?? "";
  }

  useEffect(() => {
    if (open) {
      if (defaultClientName) setClientName(defaultClientName);
      setDealName(defaultDealName ?? "");
      setValidUntil(getDefaultValidUntil());
    }
  }, [open, defaultClientName, defaultDealName]);

  const createQuote = async (payload: { name?: string; clientName?: string; validUntil?: string; notes?: string; accountId?: string; dealId?: string; installationId?: string }) => {
    setLoading(true);
    try {
      const res = await fetch("/api/cpq/quotes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || "No se pudo crear la cotización.");
      const quoteId = data?.data?.id;
      const dealQuoteRaw = data?.dealQuoteLink as { id: string; quoteId: string } | null | undefined;
      const dealQuote: { id: string; quoteId: string } | undefined =
        dealQuoteRaw?.id && dealQuoteRaw?.quoteId
          ? { id: dealQuoteRaw.id, quoteId: dealQuoteRaw.quoteId }
          : undefined;
      if (quoteId && dealId && !dealQuote) {
        toast.error("Cotización creada pero no se pudo vincular al negocio.");
      }
      setOpen(false);
      setQuoteName("");
      setClientName("");
      setDealName("");
      setValidUntil("");
      setNotes("");
      onCreated?.(quoteId, dealQuote);
      if (quoteId && !dealId) {
        // Redirigir a la cotización creada (solo si no viene desde un negocio)
        router.push(`/crm/cotizaciones/${quoteId}`);
      } else if (quoteId && dealId) {
        // Cuando se crea desde un negocio, refrescar la página del negocio
        router.refresh();
        toast.success("Cotización creada y vinculada al negocio.");
      }
    } catch (err) {
      console.error("Error creating CPQ quote:", err);
      const msg = err instanceof Error ? err.message : "No se pudo crear la cotización.";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const finalClient = hasContext ? defaultClientName : clientName;
    const finalNotes = hasContext ? (dealName.trim() || notes) : notes;
    if (hasContext && !dealName.trim()) {
      toast.error("El nombre del negocio es obligatorio.");
      return;
    }
    if (!hasContext && !clientName.trim()) {
      toast.error("El cliente es obligatorio.");
      return;
    }
    await createQuote({ name: quoteName.trim() || undefined, clientName: finalClient, validUntil, notes: finalNotes, accountId, dealId, installationId });
  };

  if (variant === "quick") {
    return (
      <Button
        size="sm"
        className="gap-2"
        onClick={() => createQuote({})}
        disabled={loading}
      >
        <Plus className="h-4 w-4" />
        <span className="hidden sm:inline">{loading ? "Creando..." : "Nueva Cotización"}</span>
      </Button>
    );
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {!isControlled && (
        <DialogTrigger asChild>
          <CrmSectionCreateButton />
        </DialogTrigger>
      )}
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Nueva Cotización</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-sm">Nombre de la cotización</Label>
            <Input
              value={quoteName}
              onChange={(e) => setQuoteName(e.target.value)}
              placeholder="Ej: Propuesta guardias planta norte"
              className="h-9 bg-background text-sm"
            />
            <p className="text-sm text-muted-foreground">Opcional — para identificar fácilmente la cotización</p>
          </div>
          {hasContext ? (
            <div className="space-y-1.5">
              <Label className="text-sm">Cliente</Label>
              <Input
                value={defaultClientName}
                readOnly
                disabled
                className="h-9 bg-muted text-sm"
              />
            </div>
          ) : (
            <div className="space-y-1.5">
              <Label className="text-sm">Cliente</Label>
              <Input
                value={clientName}
                onChange={(e) => setClientName(e.target.value)}
                placeholder="Nombre cliente"
                className="h-9 bg-background text-sm"
              />
            </div>
          )}
          {hasContext && (
            <div className="space-y-1.5">
              <Label className="text-sm">Nombre del negocio *</Label>
              <Input
                value={dealName}
                onChange={(e) => setDealName(e.target.value)}
                placeholder="Ej: Obra Kennedy con Recreo"
                className="h-9 bg-background text-sm"
              />
            </div>
          )}
          <div className="space-y-1.5">
            <Label className="text-sm">Válida hasta</Label>
            <Input
              type="date"
              value={validUntil}
              onChange={(e) => setValidUntil(e.target.value)}
              className="h-9 bg-background text-sm"
            />
          </div>
          {!hasContext && (
            <div className="space-y-1.5">
              <Label className="text-sm">Notas</Label>
              <Input
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Observaciones"
                className="h-9 bg-background text-sm"
              />
            </div>
          )}
          <Button type="submit" size="sm" className="w-full bg-status-ok hover:bg-emerald-700" disabled={loading}>
            {loading ? "Creando..." : "Crear y continuar"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
