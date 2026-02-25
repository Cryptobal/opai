"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { CrmSectionCreateButton } from "./CrmSectionCreateButton";

interface CreateDealModalProps {
  accountId: string;
  accountName: string;
  onCreated?: (dealId: string) => void;
}

export function CreateDealModal({
  accountId,
  accountName,
  onCreated,
}: CreateDealModalProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open) setTitle("");
  }, [open]);

  const createDeal = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/crm/deals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountId,
          title: title.trim() || `Negocio ${accountName}`,
          amount: 0,
          probability: 0,
        }),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload?.error || "Error creando negocio");
      setOpen(false);
      toast.success("Negocio creado");
      onCreated?.(payload.data.id);
      router.push(`/crm/deals/${payload.data.id}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo crear el negocio.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <CrmSectionCreateButton />
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Nuevo negocio</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-sm">Cliente</Label>
            <Input value={accountName} readOnly disabled className="h-9 bg-muted text-sm" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm">Título del negocio</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={`Ej: Obra ${accountName}`}
              className="h-9 bg-background text-sm"
            />
          </div>
          <Button onClick={createDeal} disabled={loading} className="w-full">
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Crear
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
