"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { EmptyState } from "@/components/opai";
import { AlertTriangle } from "lucide-react";

/* ── types ─────────────────────────────────────── */

type ClientOption = {
  id: string;
  name: string;
  installations: { id: string; name: string }[];
};

type PpcItem = {
  id: string;
  date: string;
  slotNumber: number;
  shiftCode?: string | null;
  reason: string;
  installation: { id: string; name: string };
  puesto: { id: string; name: string; shiftStart: string; shiftEnd: string };
  plannedGuardia?: {
    id: string;
    code?: string | null;
    persona: { firstName: string; lastName: string };
  } | null;
};

interface OpsPpcClientProps {
  initialClients: ClientOption[];
}

function toDateInput(date: Date): string {
  return date.toISOString().slice(0, 10);
}

const REASON_LABELS: Record<string, { label: string; color: string }> = {
  sin_guardia: { label: "Sin guardia asignado", color: "text-amber-400" },
  vacaciones: { label: "Vacaciones", color: "text-green-400" },
  licencia: { label: "Licencia médica", color: "text-yellow-400" },
  permiso: { label: "Permiso", color: "text-orange-400" },
};

/* ── component ─────────────────────────────────── */

export function OpsPpcClient({ initialClients }: OpsPpcClientProps) {
  const [clients] = useState<ClientOption[]>(initialClients);
  const [installationId, setInstallationId] = useState<string>("all");
  const [date, setDate] = useState<string>(toDateInput(new Date()));
  const [rangeMode, setRangeMode] = useState<string>("day");
  const [items, setItems] = useState<PpcItem[]>([]);
  const [loading, setLoading] = useState<boolean>(false);

  const allInstallations = useMemo(
    () => clients.flatMap((c) => c.installations),
    [clients]
  );

  const fetchPpc = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ date, range: rangeMode });
      if (installationId !== "all") params.set("installationId", installationId);
      const res = await fetch(`/api/ops/ppc?${params.toString()}`, {
        cache: "no-store",
      });
      const payload = await res.json();
      if (!res.ok || !payload.success)
        throw new Error(payload.error || "Error cargando PPC");
      setItems(payload.data.items as PpcItem[]);
    } catch (error) {
      console.error(error);
      toast.error("No se pudo cargar PPC");
    } finally {
      setLoading(false);
    }
  }, [installationId, date, rangeMode]);

  useEffect(() => {
    void fetchPpc();
  }, [fetchPpc]);

  // Group by installation
  const grouped = useMemo(() => {
    const map = new Map<string, { name: string; items: PpcItem[] }>();
    for (const item of items) {
      const key = item.installation.id;
      if (!map.has(key)) map.set(key, { name: item.installation.name, items: [] });
      map.get(key)!.items.push(item);
    }
    return Array.from(map.entries()).sort(([, a], [, b]) => a.name.localeCompare(b.name));
  }, [items]);

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="pt-5">
          <div className="grid gap-3 md:grid-cols-4">
            <div className="space-y-1.5">
              <Label>Instalación</Label>
              <select
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={installationId}
                onChange={(e) => setInstallationId(e.target.value)}
              >
                <option value="all">Todas</option>
                {allInstallations.map((inst) => (
                  <option key={inst.id} value={inst.id}>
                    {inst.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>Fecha</Label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Rango</Label>
              <select
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={rangeMode}
                onChange={(e) => setRangeMode(e.target.value)}
              >
                <option value="day">Solo este día</option>
                <option value="month">Todo el mes</option>
              </select>
            </div>
            <div className="flex items-end text-xs text-muted-foreground">
              {loading ? "Cargando..." : `${items.length} puesto(s) por cubrir`}
            </div>
          </div>
        </CardContent>
      </Card>

      {items.length === 0 ? (
        <Card>
          <CardContent className="pt-5">
            <EmptyState
              icon={<AlertTriangle className="h-8 w-8" />}
              title="Sin PPC"
              description="No hay puestos por cubrir para los filtros actuales."
              compact
            />
          </CardContent>
        </Card>
      ) : (
        grouped.map(([instId, group]) => (
          <Card key={instId}>
            <CardContent className="pt-5 space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-primary/80 uppercase tracking-wide">
                  {group.name}
                </h3>
                <Badge variant="outline">{group.items.length} PPC</Badge>
              </div>

              <div className="space-y-1.5">
                {group.items.map((item) => {
                  const reasonInfo = REASON_LABELS[item.reason] ?? REASON_LABELS.sin_guardia;
                  const dateStr = new Date(item.date).toLocaleDateString("es-CL", {
                    weekday: "short",
                    day: "2-digit",
                    month: "2-digit",
                  });
                  return (
                    <div
                      key={item.id}
                      className="rounded-lg border border-border p-3 flex items-center justify-between gap-3 min-w-0 overflow-hidden"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium">{item.puesto.name} <span className="text-muted-foreground text-xs">(Slot {item.slotNumber})</span></p>
                        <p className="text-xs text-muted-foreground">
                          {dateStr} · {item.puesto.shiftStart} - {item.puesto.shiftEnd}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className={`text-xs font-medium ${reasonInfo.color}`}>
                          {reasonInfo.label}
                        </p>
                        {item.plannedGuardia && (
                          <p className="text-[10px] text-muted-foreground">
                            {item.plannedGuardia.persona.firstName} {item.plannedGuardia.persona.lastName}
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}
