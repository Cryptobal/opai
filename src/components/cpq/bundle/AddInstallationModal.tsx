"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { BundleDetail } from "./useBundle";

type InstOption = { id: string; name: string };

export function AddInstallationModal({
  open,
  onOpenChange,
  bundle,
  onAdded,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  bundle: BundleDetail;
  onAdded: () => Promise<void>;
}) {
  const [mode, setMode] = useState<"existing" | "new">("existing");
  const [installations, setInstallations] = useState<InstOption[]>([]);
  const [installationId, setInstallationId] = useState("");
  const [newName, setNewName] = useState("");
  const [cloneFromQuoteId, setCloneFromQuoteId] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !bundle.accountId) return;
    void fetch(`/api/crm/installations?accountId=${bundle.accountId}`)
      .then((r) => r.json())
      .then((j) => {
        const list = (j?.success ? j.data : j?.data) as InstOption[] | undefined;
        setInstallations(
          Array.isArray(list)
            ? list.map((i) => ({ id: i.id, name: i.name }))
            : [],
        );
      })
      .catch(() => setInstallations([]));
  }, [open, bundle.accountId]);

  const usedIds = new Set(
    bundle.quotes
      .map((m) => m.quote.installation?.id)
      .filter(Boolean) as string[],
  );
  const available = installations.filter((i) => !usedIds.has(i.id));

  const submit = async () => {
    setLoading(true);
    try {
      const body: Record<string, unknown> = {
        cloneFromQuoteId: cloneFromQuoteId || null,
      };
      if (mode === "existing") {
        if (!installationId) {
          toast.error("Selecciona una instalación");
          return;
        }
        body.installationId = installationId;
      } else {
        if (!newName.trim()) {
          toast.error("Nombre requerido");
          return;
        }
        body.newInstallation = { name: newName.trim() };
      }
      const res = await fetch(`/api/cpq/bundles/${bundle.id}/quotes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        toast.error(json.error || "No se pudo agregar");
        return;
      }
      toast.success("Instalación agregada");
      onOpenChange(false);
      setInstallationId("");
      setNewName("");
      setCloneFromQuoteId("");
      await onAdded();
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Agregar instalación</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              variant={mode === "existing" ? "default" : "outline"}
              className="h-10 sm:h-9"
              onClick={() => setMode("existing")}
            >
              Existente
            </Button>
            <Button
              type="button"
              size="sm"
              variant={mode === "new" ? "default" : "outline"}
              className="h-10 sm:h-9"
              onClick={() => setMode("new")}
            >
              Nueva
            </Button>
          </div>

          {mode === "existing" ? (
            <div className="space-y-1.5">
              <Label>Instalación</Label>
              <select
                className="w-full h-10 sm:h-9 rounded-md border border-ds-border-default bg-background px-3 text-[13px]"
                value={installationId}
                onChange={(e) => setInstallationId(e.target.value)}
              >
                <option value="">Seleccionar…</option>
                {available.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.name}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div className="space-y-1.5">
              <Label>Nombre</Label>
              <Input
                className="h-10 sm:h-9"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Sucursal Ovalle"
              />
            </div>
          )}

          <div className="space-y-1.5">
            <Label>Copiar dotación desde (opcional)</Label>
            <select
              className="w-full h-10 sm:h-9 rounded-md border border-ds-border-default bg-background px-3 text-[13px]"
              value={cloneFromQuoteId}
              onChange={(e) => setCloneFromQuoteId(e.target.value)}
            >
              <option value="">Sin copiar (vacía)</option>
              {bundle.quotes.map((m) => (
                <option key={m.quoteId} value={m.quoteId}>
                  {m.quote.installation?.name || m.quote.code}
                </option>
              ))}
            </select>
          </div>
        </div>
        <DialogFooter>
          <Button
            className="h-10 sm:h-9"
            disabled={loading}
            onClick={() => void submit()}
          >
            {loading ? "Agregando…" : "Agregar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
