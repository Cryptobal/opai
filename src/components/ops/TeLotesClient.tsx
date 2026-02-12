"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState, StatusBadge } from "@/components/opai";
import { FileDown, Layers3 } from "lucide-react";

type LoteItem = {
  id: string;
  code: string;
  weekStart: string;
  weekEnd: string;
  status: string;
  totalAmountClp: number | string;
  paidAt?: string | null;
  items: Array<{
    id: string;
    amountClp: number | string;
    status: string;
    turnoExtraId: string;
    guardiaId: string;
  }>;
};

interface TeLotesClientProps {
  initialLotes: LoteItem[];
  defaultStatusFilter?: string;
}

function toNumber(value: number | string): number {
  if (typeof value === "number") return value;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toDateInput(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString("es-CL");
}

export function TeLotesClient({
  initialLotes,
  defaultStatusFilter = "all",
}: TeLotesClientProps) {
  const today = new Date();
  const [statusFilter, setStatusFilter] = useState<string>(defaultStatusFilter);
  const [lotes, setLotes] = useState<LoteItem[]>(initialLotes);
  const [weekStart, setWeekStart] = useState<string>(toDateInput(today));
  const [weekEnd, setWeekEnd] = useState<string>(toDateInput(today));
  const [creating, setCreating] = useState<boolean>(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    if (statusFilter === "all") return lotes;
    return lotes.filter((lote) => lote.status === statusFilter);
  }, [lotes, statusFilter]);

  const handleCreate = async () => {
    setCreating(true);
    try {
      const response = await fetch("/api/te/lotes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ weekStart, weekEnd }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.success) {
        throw new Error(payload.error || "No se pudo crear lote");
      }
      setLotes((prev) => [payload.data as LoteItem, ...prev]);
      toast.success("Lote creado");
    } catch (error) {
      console.error(error);
      toast.error("No se pudo crear lote");
    } finally {
      setCreating(false);
    }
  };

  const markAsPaid = async (loteId: string) => {
    setUpdatingId(loteId);
    try {
      const response = await fetch(`/api/te/lotes/${loteId}/marcar-pagado`, {
        method: "PATCH",
      });
      const payload = await response.json();
      if (!response.ok || !payload.success) {
        throw new Error(payload.error || "No se pudo marcar pagado");
      }
      setLotes((prev) =>
        prev.map((lote) =>
          lote.id === loteId
            ? {
                ...lote,
                status: payload.data.status,
                paidAt: payload.data.paidAt,
                items: lote.items.map((item) => ({ ...item, status: "paid" })),
              }
            : lote
        )
      );
      toast.success("Lote marcado como pagado");
    } catch (error) {
      console.error(error);
      toast.error("No se pudo marcar como pagado");
    } finally {
      setUpdatingId(null);
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="pt-5">
          <div className="grid gap-3 md:grid-cols-4">
            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground">Semana inicio</label>
              <input
                type="date"
                value={weekStart}
                onChange={(e) => setWeekStart(e.target.value)}
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground">Semana término</label>
              <input
                type="date"
                value={weekEnd}
                onChange={(e) => setWeekEnd(e.target.value)}
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground">Estado</label>
              <select
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <option value="all">Todos</option>
                <option value="pending_payment">Pendiente de pago</option>
                <option value="draft">Borrador (legado)</option>
                <option value="paid">Pagado</option>
              </select>
            </div>
            <div className="flex items-end">
              <Button onClick={handleCreate} disabled={creating}>
                {creating ? "Creando..." : "Crear lote"}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-5">
          {filtered.length === 0 ? (
            <EmptyState
              icon={<Layers3 className="h-8 w-8" />}
              title="Sin lotes"
              description="Crea el primer lote desde turnos aprobados."
              compact
            />
          ) : (
            <div className="space-y-2">
              {filtered.map((lote) => (
                <div
                  key={lote.id}
                  className="rounded-lg border border-border p-3 sm:p-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between"
                >
                  <div>
                    <p className="text-sm font-medium">{lote.code}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatDate(lote.weekStart)} - {formatDate(lote.weekEnd)} · {lote.items.length} ítem(s)
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Total: ${toNumber(lote.totalAmountClp).toLocaleString("es-CL")}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusBadge status={lote.status} />
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => window.open(`/api/te/lotes/${lote.id}/export-santander`, "_blank")}
                    >
                      <FileDown className="mr-2 h-4 w-4" />
                      Exportar
                    </Button>
                    {lote.status !== "paid" && (
                      <Button
                        size="sm"
                        disabled={updatingId === lote.id}
                        onClick={() => void markAsPaid(lote.id)}
                      >
                        Marcar pagado
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
