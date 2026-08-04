"use client";

import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

interface GavRow {
  id: string;
  name: string;
  section: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dteId: string;
  folio: number;
  issuerName: string;
  pendingClp: number;
  defaultWeekStart?: string;
  onPinned?: () => void;
}

function mondayOf(d = new Date()): string {
  const utc = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = utc.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  utc.setUTCDate(utc.getUTCDate() + diff);
  return utc.toISOString().slice(0, 10);
}

export function PinDteToFlowDialog({
  open,
  onOpenChange,
  dteId,
  folio,
  issuerName,
  pendingClp,
  defaultWeekStart,
  onPinned,
}: Props) {
  const [rows, setRows] = useState<GavRow[]>([]);
  const [rowId, setRowId] = useState("");
  const [weekStart, setWeekStart] = useState(defaultWeekStart ?? mondayOf());
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setWeekStart(defaultWeekStart ?? mondayOf());
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await fetch("/api/finance/flow-v3/rows");
        const json = await res.json();
        if (!res.ok || !json.success) throw new Error(json.error || "Error");
        const list = (Array.isArray(json.data) ? json.data : []) as Array<{
          id: string;
          name: string;
          section: string;
          archivedAt?: string | null;
        }>;
        const gav = list.filter(
          (r) =>
            !r.archivedAt &&
            ["GAV", "OTROS", "IMPUESTOS", "FINANCIAMIENTO"].includes(r.section),
        );
        if (cancelled) return;
        setRows(gav);
        setRowId((prev) => prev || gav[0]?.id || "");
      } catch (e) {
        if (!cancelled) {
          toast.error(e instanceof Error ? e.message : "No se pudieron cargar filas");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, defaultWeekStart]);

  async function submit() {
    if (!rowId || !weekStart) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/finance/cashflow/dtes/${dteId}/pin-to-flow`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rowId, weekStart }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || "Error al fijar");
      toast.success(
        json.data?.alreadyPinned
          ? `F°${folio} ya estaba fijado a esa celda`
          : `F°${folio} fijado al flujo`,
      );
      onOpenChange(false);
      onPinned?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al fijar");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Fijar al flujo</DialogTitle>
          <DialogDescription>
            F°{folio} · {issuerName} ·{" "}
            {pendingClp.toLocaleString("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 })}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-1">
          <div className="space-y-1.5">
            <Label>Fila GAV / egreso</Label>
            <Select value={rowId} onValueChange={setRowId} disabled={loading}>
              <SelectTrigger className="h-10 sm:h-9">
                <SelectValue placeholder={loading ? "Cargando…" : "Elegir fila"} />
              </SelectTrigger>
              <SelectContent>
                {rows.map((r) => (
                  <SelectItem key={r.id} value={r.id}>
                    {r.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Semana (lunes)</Label>
            <Input
              type="date"
              className="h-10 sm:h-9"
              value={weekStart}
              onChange={(e) => setWeekStart(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancelar
          </Button>
          <Button onClick={() => void submit()} disabled={busy || !rowId}>
            {busy ? "Fijando…" : "Fijar al flujo"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
