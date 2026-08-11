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
import { SearchableSelect } from "@/components/ui/SearchableSelect";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { CrmSectionCreateButton } from "./CrmSectionCreateButton";

interface CreateDealModalProps {
  accountId: string;
  accountName: string;
  onCreated?: (dealId: string) => void;
  /** Controlled mode: when provided, use these instead of internal state (no trigger rendered) */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

type InstallationOption = { id: string; name: string; city?: string | null };

export function CreateDealModal({
  accountId,
  accountName,
  onCreated,
  open: controlledOpen,
  onOpenChange: controlledOnOpenChange,
}: CreateDealModalProps) {
  const router = useRouter();
  const [internalOpen, setInternalOpen] = useState(false);
  const isControlled = controlledOpen !== undefined && controlledOnOpenChange !== undefined;
  const open = isControlled ? controlledOpen : internalOpen;
  const setOpen = isControlled ? controlledOnOpenChange : setInternalOpen;
  const [title, setTitle] = useState("");
  const [installationId, setInstallationId] = useState("");
  const [installations, setInstallations] = useState<InstallationOption[]>([]);
  const [loadingLists, setLoadingLists] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open) {
      setTitle("");
      setInstallationId("");
    }
  }, [open]);

  useEffect(() => {
    if (!open || !accountId) {
      setInstallations([]);
      return;
    }
    let cancelled = false;
    setLoadingLists(true);
    fetch(`/api/crm/installations?accountId=${accountId}`)
      .then((r) => (r.ok ? r.json() : { success: false }))
      .then((payload) => {
        if (cancelled) return;
        if (payload?.success && Array.isArray(payload.data)) {
          setInstallations(
            payload.data
              .map((row: Record<string, unknown>) => ({
                id: String(row.id ?? ""),
                name: String(row.name ?? ""),
                city: typeof row.city === "string" ? row.city : null,
              }))
              .filter((row: InstallationOption) => row.id),
          );
        } else {
          setInstallations([]);
        }
      })
      .catch(() => {
        if (!cancelled) setInstallations([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingLists(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, accountId]);

  const createDeal = async () => {
    setLoading(true);
    try {
      const selectedInstallation = installations.find((i) => i.id === installationId);
      const res = await fetch("/api/crm/deals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountId,
          title: title.trim() || `Negocio ${accountName}`,
          amount: 0,
          probability: 0,
          ...(selectedInstallation
            ? { installationName: selectedInstallation.name }
            : {}),
        }),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload?.error || "Error creando negocio");
      setOpen(false);
      toast.success("Negocio creado");
      onCreated?.(payload.data.id);
      if (installationId) {
        const params = new URLSearchParams({
          createQuote: "1",
          installationId,
        });
        router.push(`/crm/deals/${payload.data.id}?${params.toString()}`);
      } else {
        router.push(`/crm/deals/${payload.data.id}`);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo crear el negocio.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {!isControlled && (
        <DialogTrigger asChild>
          <CrmSectionCreateButton />
        </DialogTrigger>
      )}
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Nuevo negocio</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-sm">Cliente</Label>
            <Input value={accountName} readOnly disabled className="h-10 sm:h-9 bg-muted text-sm" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm">Título del negocio</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={`Ej: Obra ${accountName}`}
              className="h-10 sm:h-9 bg-background text-sm"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm">Instalación</Label>
            <SearchableSelect
              value={installationId}
              options={installations.map((i) => ({
                id: i.id,
                label: i.name,
                description: i.city || undefined,
              }))}
              placeholder={loadingLists ? "Cargando…" : "Seleccionar instalación existente…"}
              emptyText="Sin instalaciones — créala desde la ficha del negocio"
              disabled={loadingLists}
              dropdownInPortal
              onChange={setInstallationId}
            />
            <p className="text-[12px] text-muted-foreground">
              Opcional. Si eliges una, al crear se abre la cotización lista para vincularla.
            </p>
          </div>
          <Button onClick={createDeal} disabled={loading} className="w-full h-10 sm:h-9">
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Crear
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
