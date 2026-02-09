/**
 * Modal para crear cotización CPQ
 */

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus } from "lucide-react";

interface CreateQuoteModalProps {
  onCreated?: () => void;
  variant?: "modal" | "quick";
}

export function CreateQuoteModal({ onCreated, variant = "modal" }: CreateQuoteModalProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [clientName, setClientName] = useState("");
  const [validUntil, setValidUntil] = useState("");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);

  const createQuote = async (payload: { clientName?: string; validUntil?: string; notes?: string }) => {
    setLoading(true);
    try {
      const res = await fetch("/api/cpq/quotes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || "Error");
      setOpen(false);
      setClientName("");
      setValidUntil("");
      setNotes("");
      onCreated?.();
      if (data?.data?.id) {
        router.push(`/cpq/${data.data.id}`);
      }
    } catch (err) {
      console.error("Error creating CPQ quote:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await createQuote({ clientName, validUntil, notes });
  };

  if (variant === "quick") {
    return (
      <Button
        size="sm"
        className="gap-2 bg-teal-600 hover:bg-teal-700 text-white"
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
        <Button size="sm" className="gap-2 bg-teal-600 hover:bg-teal-700 text-white">
          <Plus className="h-4 w-4" />
          <span className="hidden sm:inline">Nueva Cotización</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-[95vw] sm:max-w-md p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle>Nueva Cotización</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="space-y-1">
            <Label className="text-xs sm:text-sm">Cliente</Label>
            <Input
              value={clientName}
              onChange={(e) => setClientName(e.target.value)}
              placeholder="Nombre cliente"
              className="h-11 sm:h-9 bg-background text-base sm:text-sm"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs sm:text-sm">Válida hasta</Label>
            <Input
              type="date"
              value={validUntil}
              onChange={(e) => setValidUntil(e.target.value)}
              className="h-11 sm:h-9 bg-background text-base sm:text-sm"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs sm:text-sm">Notas</Label>
            <Input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Observaciones"
              className="h-11 sm:h-9 bg-background text-base sm:text-sm"
            />
          </div>
          <Button type="submit" size="sm" className="w-full" disabled={loading}>
            {loading ? "Creando..." : "Crear y continuar"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
