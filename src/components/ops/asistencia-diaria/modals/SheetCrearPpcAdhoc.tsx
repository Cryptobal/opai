"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Loader2 } from "lucide-react";
import type { ClientOption } from "@/types/ops-asistencia";
import type { PatchResult } from "@/hooks/useAsistenciaDiaria";
import { toast } from "sonner";

type PuestoOption = {
  id: string;
  name: string;
  shiftStart: string;
  shiftEnd: string;
};

interface SheetCrearPpcAdhocProps {
  open: boolean;
  onClose: () => void;
  isDesktop: boolean;
  isSaving: boolean;
  selectedDate: string;
  clients: ClientOption[];
  /** Prefill instalación (sheet de un solo site). */
  defaultInstallationId?: string;
  crearAdhoc: (payload: {
    installationId: string;
    puestoId: string;
    date: string;
    reason: "induccion" | "refuerzo" | "otro";
    shiftStart?: string;
    shiftEnd?: string;
    notes?: string | null;
  }) => Promise<PatchResult>;
}

export function SheetCrearPpcAdhoc({
  open,
  onClose,
  isDesktop,
  isSaving,
  selectedDate,
  clients,
  defaultInstallationId,
  crearAdhoc,
}: SheetCrearPpcAdhocProps) {
  const installations = useMemo(
    () =>
      clients.flatMap((c) =>
        c.installations.map((i) => ({ id: i.id, name: `${c.name} · ${i.name}` }))
      ),
    [clients]
  );

  const [installationId, setInstallationId] = useState("");
  const [puestos, setPuestos] = useState<PuestoOption[]>([]);
  const [puestosLoading, setPuestosLoading] = useState(false);
  const [puestoId, setPuestoId] = useState("");
  const [reason, setReason] = useState<"induccion" | "refuerzo" | "otro">("induccion");
  const [shiftStart, setShiftStart] = useState("");
  const [shiftEnd, setShiftEnd] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (!open) return;
    const initial =
      defaultInstallationId ||
      installations.find((i) => i.id === defaultInstallationId)?.id ||
      installations[0]?.id ||
      "";
    setInstallationId(initial);
    setPuestoId("");
    setReason("induccion");
    setShiftStart("");
    setShiftEnd("");
    setNotes("");
  }, [open, defaultInstallationId, installations]);

  useEffect(() => {
    if (!open || !installationId) {
      setPuestos([]);
      return;
    }
    let cancelled = false;
    setPuestosLoading(true);
    void (async () => {
      try {
        const res = await fetch(
          `/api/ops/puestos?installationId=${installationId}`,
          { cache: "no-store" }
        );
        const data = await res.json();
        if (cancelled) return;
        const raw = (data.data ?? []) as Array<PuestoOption & { active?: boolean }>;
        const normalized = Array.isArray(raw)
          ? raw
              .filter((p) => p.active !== false)
              .map((p) => ({
                id: p.id,
                name: p.name,
                shiftStart: p.shiftStart ?? "09:00",
                shiftEnd: p.shiftEnd ?? "19:00",
              }))
          : [];
        setPuestos(normalized);
        if (normalized[0]) {
          setPuestoId(normalized[0].id);
          setShiftStart(normalized[0].shiftStart);
          setShiftEnd(normalized[0].shiftEnd);
        }
      } catch {
        if (!cancelled) setPuestos([]);
      } finally {
        if (!cancelled) setPuestosLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, installationId]);

  const onPuestoChange = (id: string) => {
    setPuestoId(id);
    const p = puestos.find((x) => x.id === id);
    if (p) {
      setShiftStart(p.shiftStart);
      setShiftEnd(p.shiftEnd);
    }
  };

  const canSubmit =
    !isSaving &&
    !puestosLoading &&
    Boolean(installationId && puestoId && shiftStart && shiftEnd);

  const handleSubmit = async () => {
    if (!canSubmit) return;
    const result = await crearAdhoc({
      installationId,
      puestoId,
      date: selectedDate,
      reason,
      shiftStart,
      shiftEnd,
      notes: notes.trim() || null,
    });
    if (result.ok) {
      toast.success("PPC ad-hoc creado");
      onClose();
    }
  };

  const content = (
    <div className="space-y-4 py-2">
      <div className="space-y-2">
        <Label htmlFor="adhoc-inst">Instalación</Label>
        <select
          id="adhoc-inst"
          className="h-11 sm:h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
          value={installationId}
          onChange={(e) => setInstallationId(e.target.value)}
          disabled={Boolean(defaultInstallationId)}
        >
          {installations.map((i) => (
            <option key={i.id} value={i.id}>
              {i.name}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="adhoc-puesto">Puesto</Label>
        <select
          id="adhoc-puesto"
          className="h-11 sm:h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
          value={puestoId}
          onChange={(e) => onPuestoChange(e.target.value)}
          disabled={puestosLoading || puestos.length === 0}
        >
          {puestos.length === 0 && (
            <option value="">{puestosLoading ? "Cargando…" : "Sin puestos activos"}</option>
          )}
          {puestos.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="adhoc-reason">Motivo</Label>
        <select
          id="adhoc-reason"
          className="h-11 sm:h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
          value={reason}
          onChange={(e) =>
            setReason(e.target.value as "induccion" | "refuerzo" | "otro")
          }
        >
          <option value="induccion">Inducción</option>
          <option value="refuerzo">Refuerzo</option>
          <option value="otro">Otro</option>
        </select>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label htmlFor="adhoc-start">Inicio</Label>
          <Input
            id="adhoc-start"
            type="time"
            value={shiftStart}
            onChange={(e) => setShiftStart(e.target.value)}
            className="h-11 sm:h-10"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="adhoc-end">Fin</Label>
          <Input
            id="adhoc-end"
            type="time"
            value={shiftEnd}
            onChange={(e) => setShiftEnd(e.target.value)}
            className="h-11 sm:h-10"
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="adhoc-notes">Notas (opcional)</Label>
        <Input
          id="adhoc-notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Detalle del PPC…"
          className="h-11 sm:h-10"
          maxLength={2000}
        />
      </div>

      <div className="flex flex-col gap-2 pt-1">
        <Button
          className="h-11 sm:h-10 w-full"
          disabled={!canSubmit}
          onClick={() => void handleSubmit()}
        >
          {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Crear PPC"}
        </Button>
        <Button
          variant="ghost"
          className="h-11 sm:h-10 w-full"
          disabled={isSaving}
          onClick={onClose}
        >
          Cancelar
        </Button>
      </div>
    </div>
  );

  if (isDesktop) {
    return (
      <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Nuevo PPC ad-hoc</DialogTitle>
          </DialogHeader>
          {content}
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent
        side="bottom"
        className="rounded-t-2xl pb-[max(env(safe-area-inset-bottom),1.5rem)] max-h-[90dvh] overflow-y-auto"
      >
        <SheetHeader>
          <SheetTitle>Nuevo PPC ad-hoc</SheetTitle>
        </SheetHeader>
        {content}
      </SheetContent>
    </Sheet>
  );
}
