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
  dealId?: string;
}

export function CreateQuoteModal({ onCreated, variant = "modal", defaultClientName, defaultDealName, accountId, dealId }: CreateQuoteModalProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [clientName, setClientName] = useState(defaultClientName ?? "");
  const [dealName, setDealName] = useState("");
  const [validUntil, setValidUntil] = useState("");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);

  const hasContext = Boolean(defaultClientName);

  useEffect(() => {
    if (open) {
      if (defaultClientName) setClientName(defaultClientName);
      setDealName(defaultDealName ?? "");
    }
  }, [open, defaultClientName, defaultDealName]);

  const createQuote = async (payload: { clientName?: string; validUntil?: string; notes?: string; accountId?: string }) => {
    setLoading(true);
    try {
      const res = await fetch("/api/cpq/quotes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || "Error");
      const quoteId = data?.data?.id;
      let dealQuote: { id: string; quoteId: string } | undefined;
      if (quoteId && dealId) {
        const linkRes = await fetch(`/api/crm/deals/${dealId}/quotes`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ quoteId }),
        });
        const linkPayload = await linkRes.json();
        if (linkRes.ok && linkPayload?.data) {
          dealQuote = { id: linkPayload.data.id, quoteId: linkPayload.data.quoteId };
        } else {
          toast.error("Cotización creada pero no se pudo vincular al negocio.");
        }
      }
      setOpen(false);
      setClientName("");
      setDealName("");
      setValidUntil("");
      setNotes("");
      onCreated?.(quoteId, dealQuote);
      if (quoteId) {
        router.push(`/cpq/${quoteId}`);
      }
    } catch (err) {
      console.error("Error creating CPQ quote:", err);
      toast.error("No se pudo crear la cotización.");
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
    await createQuote({ clientName: finalClient, validUntil, notes: finalNotes, accountId });
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
      <DialogTrigger asChild>
        <CrmSectionCreateButton />
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Nueva Cotización</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3">
          {hasContext ? (
            <div className="space-y-1.5">
              <Label className="text-sm">Cliente</Label>
              <Input
                value={defaultClientName}
                readOnly
                disabled
                className="h-10 bg-muted text-sm"
              />
            </div>
          ) : (
            <div className="space-y-1.5">
              <Label className="text-sm">Cliente</Label>
              <Input
                value={clientName}
                onChange={(e) => setClientName(e.target.value)}
                placeholder="Nombre cliente"
                className="h-10 bg-background text-sm"
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
                className="h-10 bg-background text-sm"
              />
            </div>
          )}
          <div className="space-y-1.5">
            <Label className="text-sm">Válida hasta</Label>
            <Input
              type="date"
              value={validUntil}
              onChange={(e) => setValidUntil(e.target.value)}
              className="h-10 bg-background text-sm"
            />
          </div>
          {!hasContext && (
            <div className="space-y-1.5">
              <Label className="text-sm">Notas</Label>
              <Input
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Observaciones"
                className="h-10 bg-background text-sm"
              />
            </div>
          )}
          <Button type="submit" size="sm" className="w-full bg-emerald-600 hover:bg-emerald-700" disabled={loading}>
            {loading ? "Creando..." : "Crear y continuar"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
