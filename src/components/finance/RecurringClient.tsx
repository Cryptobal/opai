"use client";

/**
 * UI mínima para gestionar plantillas de facturación recurrente.
 * Listado + acciones (ejecutar ahora, pausar/activar, eliminar).
 * Crear/editar plantillas se gestiona inicialmente vía API; UI completa
 * de form puede agregarse después sin cambiar el contrato del backend.
 */
import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, Play, Pause, Trash2, RefreshCw } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

const DTE_LABELS: Record<number, string> = {
  33: "Factura Electrónica",
  34: "Factura Exenta",
};

const FREQ_LABELS: Record<string, string> = {
  monthly: "Mensual",
  biweekly: "Quincenal",
  weekly: "Semanal",
  yearly: "Anual",
};

const DOW_LABELS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

type Template = {
  id: string;
  name: string;
  isActive: boolean;
  dteType: number;
  receiverName: string;
  receiverRut: string;
  currency: string;
  frequency: string;
  dayOfMonth: number | null;
  dayOfWeek: number | null;
  monthOfYear: number | null;
  startDate: string;
  endDate: string | null;
  nextRunAt: string | null;
  lastRunAt: string | null;
  runCount: number;
};

function formatFrequency(t: Template): string {
  const base = FREQ_LABELS[t.frequency] ?? t.frequency;
  if (t.frequency === "monthly") {
    if (t.dayOfMonth === -1) return `${base} · último día`;
    return `${base} · día ${t.dayOfMonth ?? 1}`;
  }
  if (t.frequency === "weekly" || t.frequency === "biweekly") {
    return `${base} · ${DOW_LABELS[t.dayOfWeek ?? 1]}`;
  }
  if (t.frequency === "yearly") {
    return `${base} · ${t.monthOfYear ?? 1}/${t.dayOfMonth ?? 1}`;
  }
  return base;
}

export function RecurringClient({
  initialTemplates,
  canManage,
}: {
  initialTemplates: Template[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [templates, setTemplates] = React.useState<Template[]>(initialTemplates);
  const [busyId, setBusyId] = React.useState<string | null>(null);

  const reload = React.useCallback(async () => {
    const res = await fetch("/api/finance/billing/recurring");
    const j = await res.json();
    if (j?.success) setTemplates(j.data?.templates ?? []);
  }, []);

  const handleRunNow = async (id: string) => {
    setBusyId(id);
    try {
      const res = await fetch(`/api/finance/billing/recurring/${id}/run-now`, { method: "POST" });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "Error al ejecutar");
      const status = j.data?.status;
      if (status === "success") {
        toast.success("Borrador generado. Revísalo en la pestaña Borradores.");
      } else if (status === "failed") {
        toast.error(j.data?.error || "Falla al generar borrador");
      } else {
        toast.info(`Saltado (${status})`);
      }
      await reload();
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error inesperado");
    } finally {
      setBusyId(null);
    }
  };

  const handleToggleActive = async (t: Template) => {
    setBusyId(t.id);
    try {
      // GET para obtener el shape full y mantener todos los campos.
      const fullRes = await fetch(`/api/finance/billing/recurring/${t.id}`);
      const fullJson = await fullRes.json();
      if (!fullRes.ok) throw new Error(fullJson.error || "Error");
      const full = fullJson.data;
      const res = await fetch(`/api/finance/billing/recurring/${t.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...full,
          isActive: !t.isActive,
          startDate: full.startDate.split("T")[0],
          endDate: full.endDate ? full.endDate.split("T")[0] : undefined,
        }),
      });
      if (!res.ok) {
        const j = await res.json();
        throw new Error(j.error || "Error al actualizar");
      }
      toast.success(t.isActive ? "Plantilla pausada" : "Plantilla activada");
      await reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error inesperado");
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("¿Eliminar esta plantilla? Las corridas históricas se mantienen.")) return;
    setBusyId(id);
    try {
      const res = await fetch(`/api/finance/billing/recurring/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const j = await res.json();
        throw new Error(j.error || "Error al eliminar");
      }
      toast.success("Plantilla eliminada");
      await reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error inesperado");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Card>
      <CardContent className="pt-4">
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="text-sm text-muted-foreground">
              {templates.length === 0
                ? "Aún no hay plantillas."
                : `${templates.filter((t) => t.isActive).length} activas / ${templates.length} totales`}
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={reload}>
            <RefreshCw className="size-4 mr-1.5" />
            Actualizar
          </Button>
        </div>

        {templates.length === 0 ? (
          <div className="py-12 text-center text-sm text-muted-foreground">
            Aún no se han creado plantillas recurrentes. Por ahora se crean vía API:
            <code className="block mt-2 text-xs">POST /api/finance/billing/recurring</code>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="py-2 text-left">Plantilla</th>
                  <th className="py-2 text-left">Tipo</th>
                  <th className="py-2 text-left">Frecuencia</th>
                  <th className="py-2 text-left">Próxima</th>
                  <th className="py-2 text-left">Última</th>
                  <th className="py-2 text-right">Corridas</th>
                  <th className="py-2 text-left">Estado</th>
                  <th className="py-2 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {templates.map((t) => (
                  <tr key={t.id} className="border-b hover:bg-muted/40">
                    <td className="py-2">
                      <div className="font-medium">{t.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {t.receiverName} ({t.receiverRut})
                      </div>
                    </td>
                    <td className="py-2 text-xs">
                      {DTE_LABELS[t.dteType] ?? `Tipo ${t.dteType}`}
                      <div className="text-xs text-muted-foreground">{t.currency}</div>
                    </td>
                    <td className="py-2 text-xs">{formatFrequency(t)}</td>
                    <td className="py-2 text-xs">{t.nextRunAt ?? "—"}</td>
                    <td className="py-2 text-xs">
                      {t.lastRunAt ? new Date(t.lastRunAt).toLocaleDateString("es-CL") : "—"}
                    </td>
                    <td className="py-2 text-right text-xs">{t.runCount}</td>
                    <td className="py-2 text-xs">
                      {t.isActive ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-green-100 text-green-800">
                          Activa
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-gray-100 text-gray-700">
                          Pausada
                        </span>
                      )}
                    </td>
                    <td className="py-2 text-right">
                      <div className="flex justify-end gap-1">
                        {canManage && (
                          <>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleRunNow(t.id)}
                              disabled={busyId === t.id || !t.isActive}
                              title="Ejecutar ahora (genera borrador)"
                            >
                              {busyId === t.id ? (
                                <Loader2 className="size-4 animate-spin" />
                              ) : (
                                <Play className="size-4" />
                              )}
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleToggleActive(t)}
                              disabled={busyId === t.id}
                              title={t.isActive ? "Pausar" : "Activar"}
                            >
                              {t.isActive ? <Pause className="size-4" /> : <Play className="size-4" />}
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDelete(t.id)}
                              disabled={busyId === t.id}
                              title="Eliminar"
                            >
                              <Trash2 className="size-4" />
                            </Button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
