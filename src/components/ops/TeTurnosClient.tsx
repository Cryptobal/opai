"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState, StatusBadge } from "@/components/opai";
import { Clock3, FileDown, Search } from "lucide-react";

type TeItem = {
  id: string;
  date: string;
  status: string;
  amountClp: number | string;
  approvedAt?: string | null;
  rejectedAt?: string | null;
  paidAt?: string | null;
  installation?: { id: string; name: string } | null;
  puesto?: { id: string; name: string } | null;
  guardia: {
    id: string;
    code?: string | null;
    persona: {
      firstName: string;
      lastName: string;
      rut?: string | null;
    };
  };
  paymentItems?: Array<{ id: string; loteId: string; amountClp: number | string; status: string }>;
};

interface TeTurnosClientProps {
  initialItems: TeItem[];
  defaultStatusFilter?: string;
}

function toNumber(value: number | string): number {
  if (typeof value === "number") return value;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toDateLabel(value: string): string {
  return new Date(value).toLocaleDateString("es-CL");
}

export function TeTurnosClient({
  initialItems,
  defaultStatusFilter = "all",
}: TeTurnosClientProps) {
  const [items, setItems] = useState<TeItem[]>(initialItems);
  const [statusFilter, setStatusFilter] = useState<string>(defaultStatusFilter);
  const [search, setSearch] = useState<string>("");
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [generatingPlantilla, setGeneratingPlantilla] = useState(false);

  const canAddToLote = (item: TeItem) =>
    item.status === "approved" && (!item.paymentItems || item.paymentItems.length === 0);

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAllApproved = () => {
    const approved = filtered.filter(canAddToLote).map((i) => i.id);
    setSelectedIds((prev) => {
      const next = new Set(prev);
      approved.forEach((id) => next.add(id));
      return next;
    });
  };

  const clearSelection = () => setSelectedIds(new Set());

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return items.filter((item) => {
      if (statusFilter !== "all" && item.status !== statusFilter) return false;
      if (query) {
        const haystack =
          `${item.installation?.name ?? ""} ${item.puesto?.name ?? ""} ${item.guardia.persona.firstName} ${item.guardia.persona.lastName} ${item.guardia.persona.rut ?? ""}`.toLowerCase();
        if (!haystack.includes(query)) return false;
      }
      return true;
    });
  }, [items, search, statusFilter]);

  const patch = async (id: string, action: "aprobar" | "rechazar", reason?: string) => {
    setUpdatingId(id);
    try {
      const response = await fetch(`/api/te/${id}/${action}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: action === "rechazar" ? JSON.stringify({ reason: reason ?? null }) : undefined,
      });
      const payload = await response.json();
      if (!response.ok || !payload.success) {
        throw new Error(payload.error || "Error actualizando turno extra");
      }
      setItems((prev) =>
        prev.map((row) =>
          row.id === id
            ? {
                ...row,
                status: payload.data.status,
                approvedAt: payload.data.approvedAt,
                rejectedAt: payload.data.rejectedAt,
                paidAt: payload.data.paidAt,
              }
            : row
        )
      );
      toast.success(action === "aprobar" ? "Turno aprobado" : "Turno rechazado");
    } catch (error) {
      console.error(error);
      toast.error("No se pudo actualizar el turno");
    } finally {
      setUpdatingId(null);
    }
  };

  const handleGenerarPlantilla = async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) {
      toast.error("Selecciona al menos un turno aprobado");
      return;
    }
    setGeneratingPlantilla(true);
    try {
      const createRes = await fetch("/api/te/lotes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ turnoExtraIds: ids }),
      });
      const createPayload = await createRes.json();
      if (!createRes.ok || !createPayload.success) {
        throw new Error(createPayload.error || "No se pudo crear el lote");
      }
      const loteId = createPayload.data?.id;
      if (!loteId) throw new Error("Lote creado sin ID");

      const exportUrl = `/api/te/lotes/${loteId}/export-santander`;
      const exportRes = await fetch(exportUrl);
      if (!exportRes.ok) throw new Error("No se pudo generar la plantilla");
      const blob = await exportRes.blob();
      const code = createPayload.data?.code ?? "lote";
      const filename = `${code}-santander.xlsx`;
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = filename;
      a.click();
      URL.revokeObjectURL(a.href);

      setSelectedIds(new Set());
      setItems((prev) =>
        prev.map((row) =>
          ids.includes(row.id)
            ? {
                ...row,
                paymentItems: [
                  {
                    id: "",
                    loteId,
                    amountClp: row.amountClp,
                    status: "pending",
                  },
                ],
              }
            : row
        )
      );
      toast.success(`Lote creado. Plantilla ${filename} descargada.`);
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : "No se pudo generar la plantilla");
    } finally {
      setGeneratingPlantilla(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="pt-5">
          <div className="grid gap-3 md:grid-cols-3">
            <div className="relative md:col-span-2">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder="Buscar por instalación, puesto, guardia o RUT..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <select
              className="h-9 rounded-md border border-input bg-background px-3 text-sm"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="all">Todos</option>
              <option value="pending">Pendientes</option>
              <option value="approved">Aprobados</option>
              <option value="rejected">Rechazados</option>
              <option value="paid">Pagados</option>
            </select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-5">
          {filtered.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 mb-4">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={selectAllApproved}
              >
                Seleccionar todos los aprobados
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={clearSelection}
                disabled={selectedIds.size === 0}
              >
                Quitar selección
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={selectedIds.size === 0 || generatingPlantilla}
                onClick={() => void handleGenerarPlantilla()}
              >
                {generatingPlantilla ? "..." : (
                  <>
                    <FileDown className="h-4 w-4 mr-1" />
                    Generar plantilla de pago ({selectedIds.size})
                  </>
                )}
              </Button>
              {selectedIds.size > 0 && (
                <span className="text-xs text-muted-foreground">
                  {selectedIds.size} turno(s) seleccionado(s)
                </span>
              )}
            </div>
          )}

          {filtered.length === 0 ? (
            <EmptyState
              icon={<Clock3 className="h-8 w-8" />}
              title="Sin turnos extra"
              description="No hay registros para los filtros seleccionados."
              compact
            />
          ) : (
            <div className="space-y-2">
              {filtered.map((item) => (
                <div
                  key={item.id}
                  className="rounded-lg border border-border p-3 sm:p-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between"
                >
                  <div className="flex items-start gap-3 min-w-0">
                    {canAddToLote(item) ? (
                      <label className="flex items-center gap-2 shrink-0 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={selectedIds.has(item.id)}
                          onChange={() => toggleSelect(item.id)}
                          className="rounded border-border"
                        />
                        <span className="sr-only">Incluir en plantilla de pago</span>
                      </label>
                    ) : (
                      <span className="w-5 shrink-0" aria-hidden />
                    )}
                    <div className="min-w-0">
                      <p className="text-sm font-medium">
                        {item.guardia.persona.firstName} {item.guardia.persona.lastName}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {item.installation?.name ?? "Instalación"} · {item.puesto?.name ?? "Sin puesto"} ·{" "}
                        {toDateLabel(item.date)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Monto: ${toNumber(item.amountClp).toLocaleString("es-CL")}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <StatusBadge status={item.status} />
                    {item.status === "pending" && (
                      <>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={updatingId === item.id}
                          onClick={() => void patch(item.id, "aprobar")}
                        >
                          Aprobar
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={updatingId === item.id}
                          onClick={() => {
                            const reason = window.prompt("Motivo de rechazo (opcional):") ?? "";
                            void patch(item.id, "rechazar", reason || undefined);
                          }}
                        >
                          Rechazar
                        </Button>
                      </>
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
