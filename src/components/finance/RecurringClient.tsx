"use client";

/**
 * UI mínima para gestionar plantillas de facturación recurrente.
 * Listado + acciones (ejecutar ahora, pausar/activar, eliminar).
 * Crear/editar plantillas se gestiona inicialmente vía API; UI completa
 * de form puede agregarse después sin cambiar el contrato del backend.
 */
import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, Play, Pause, Trash2, RefreshCw, Plus } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
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
  ufFixingPolicy?: string;
  ufFixingDay?: number | null;
};

const UF_POLICY_LABEL: Record<string, string> = {
  RUN_DAY: "UF del día de generación",
  LAST_DAY_PREV_MONTH: "UF del último día del mes anterior",
  FIRST_DAY_MONTH: "UF del primer día del mes",
  LAST_DAY_MONTH: "UF del último día del mes",
  CUSTOM_DAY: "UF del día específico",
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
  const [createOpen, setCreateOpen] = React.useState(false);

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
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <div>
            <p className="text-sm text-muted-foreground">
              {templates.length === 0
                ? "Aún no hay plantillas."
                : `${templates.filter((t) => t.isActive).length} activas / ${templates.length} totales`}
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={reload}>
              <RefreshCw className="size-4 mr-1.5" />
              Actualizar
            </Button>
            {canManage && (
              <Button size="sm" onClick={() => setCreateOpen(true)}>
                <Plus className="size-4 mr-1.5" />
                Nueva plantilla
              </Button>
            )}
          </div>
        </div>

        {templates.length === 0 ? (
          <div className="py-12 text-center text-sm text-muted-foreground space-y-3">
            <p>Aún no se han creado plantillas recurrentes.</p>
            {canManage && (
              <Button size="sm" onClick={() => setCreateOpen(true)}>
                <Plus className="size-4 mr-1.5" />
                Crear primera plantilla
              </Button>
            )}
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
                      <div className="text-xs text-muted-foreground">
                        {t.currency}
                        {t.currency === "UF" && t.ufFixingPolicy && (
                          <span
                            className="block text-[12px]"
                            title={
                              t.ufFixingPolicy === "CUSTOM_DAY"
                                ? `UF del día ${t.ufFixingDay ?? "?"} del mes`
                                : (UF_POLICY_LABEL[t.ufFixingPolicy] ?? t.ufFixingPolicy)
                            }
                          >
                            {t.ufFixingPolicy === "RUN_DAY"
                              ? "UF: día de ejecución"
                              : t.ufFixingPolicy === "CUSTOM_DAY"
                                ? `UF: día ${t.ufFixingDay ?? "?"}`
                                : t.ufFixingPolicy === "LAST_DAY_PREV_MONTH"
                                  ? "UF: fin mes anterior"
                                  : t.ufFixingPolicy === "FIRST_DAY_MONTH"
                                    ? "UF: 1° del mes"
                                    : t.ufFixingPolicy === "LAST_DAY_MONTH"
                                      ? "UF: fin del mes"
                                      : t.ufFixingPolicy}
                          </span>
                        )}
                      </div>
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

      {createOpen && (
        <CreateTemplateDialog
          open={createOpen}
          onClose={() => setCreateOpen(false)}
          onCreated={() => {
            setCreateOpen(false);
            reload();
            router.refresh();
          }}
        />
      )}
    </Card>
  );
}

/**
 * Modal compacto para crear una plantilla recurrente. Cubre los campos
 * mínimos: nombre, receptor, monto, frecuencia, política de UF.
 *
 * Para casos avanzados (líneas múltiples, descuentos, exentas, refs
 * adicionales) el usuario puede crear un borrador normal y luego
 * "Convertir a plantilla recurrente" (feature pendiente Fase 5).
 */
function CreateTemplateDialog({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [name, setName] = React.useState("");
  const [dteType, setDteType] = React.useState("33");
  const [receiverRut, setReceiverRut] = React.useState("");
  const [receiverName, setReceiverName] = React.useState("");
  const [receiverEmail, setReceiverEmail] = React.useState("");
  const [currency, setCurrency] = React.useState<"CLP" | "UF">("CLP");
  const [itemName, setItemName] = React.useState("Servicio de seguridad mensual");
  const [unitPrice, setUnitPrice] = React.useState("");
  const [frequency, setFrequency] = React.useState<
    "monthly" | "biweekly" | "weekly" | "yearly"
  >("monthly");
  const [dayOfMonth, setDayOfMonth] = React.useState("1");
  const [dayOfWeek, setDayOfWeek] = React.useState("1");
  const [startDate, setStartDate] = React.useState(
    new Date().toISOString().split("T")[0],
  );
  const [ufFixingPolicy, setUfFixingPolicy] = React.useState<
    | "RUN_DAY"
    | "LAST_DAY_PREV_MONTH"
    | "FIRST_DAY_MONTH"
    | "LAST_DAY_MONTH"
    | "CUSTOM_DAY"
  >("LAST_DAY_PREV_MONTH");
  const [ufFixingDay, setUfFixingDay] = React.useState("1");
  const [autoSendEmail, setAutoSendEmail] = React.useState(true);
  const [submitting, setSubmitting] = React.useState(false);

  const handleSubmit = async () => {
    if (!name.trim() || !receiverRut.trim() || !receiverName.trim() || !unitPrice) {
      toast.error("Nombre, RUT, razón social y monto son obligatorios.");
      return;
    }
    setSubmitting(true);
    try {
      const body = {
        name: name.trim(),
        isActive: true,
        dteType: parseInt(dteType, 10),
        receiverRut: receiverRut.trim(),
        receiverName: receiverName.trim(),
        receiverEmail: receiverEmail.trim() || null,
        receiverEmailCc: [],
        currency,
        lines: [
          {
            itemName: itemName.trim(),
            quantity: 1,
            unitPrice: currency === "UF" ? 0 : parseFloat(unitPrice),
            unitPriceUf: currency === "UF" ? parseFloat(unitPrice) : undefined,
            isExempt: false,
          },
        ],
        frequency,
        dayOfMonth:
          frequency === "monthly" || frequency === "yearly"
            ? parseInt(dayOfMonth, 10)
            : undefined,
        dayOfWeek:
          frequency === "weekly" || frequency === "biweekly"
            ? parseInt(dayOfWeek, 10)
            : undefined,
        startDate,
        autoSendEmail,
        ufFixingPolicy: currency === "UF" ? ufFixingPolicy : "RUN_DAY",
        ufFixingDay:
          currency === "UF" && ufFixingPolicy === "CUSTOM_DAY"
            ? parseInt(ufFixingDay, 10)
            : null,
      };
      const res = await fetch("/api/finance/billing/recurring", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error ?? "Error al crear plantilla");
      }
      toast.success("Plantilla recurrente creada.");
      onCreated();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && !submitting && onClose()}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nueva plantilla recurrente</DialogTitle>
          <DialogDescription>
            Cada vez que se ejecute el cron, esta plantilla genera un borrador
            que tendrás que revisar y emitir manualmente.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="r-name">Nombre interno *</Label>
            <Input
              id="r-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ej: Servicio Mall Costanera mensual"
              className="h-10 sm:h-9"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Tipo DTE *</Label>
              <Select value={dteType} onValueChange={setDteType}>
                <SelectTrigger className="h-10 sm:h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="33">Factura Electrónica (33)</SelectItem>
                  <SelectItem value="34">Factura Exenta (34)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Moneda *</Label>
              <Select
                value={currency}
                onValueChange={(v) => setCurrency(v as "CLP" | "UF")}
              >
                <SelectTrigger className="h-10 sm:h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="CLP">CLP (pesos)</SelectItem>
                  <SelectItem value="UF">UF</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="r-rut">RUT receptor *</Label>
              <Input
                id="r-rut"
                value={receiverRut}
                onChange={(e) => setReceiverRut(e.target.value)}
                placeholder="76.123.456-7"
                className="h-10 sm:h-9"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="r-name-rec">Razón social receptor *</Label>
              <Input
                id="r-name-rec"
                value={receiverName}
                onChange={(e) => setReceiverName(e.target.value)}
                className="h-10 sm:h-9"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="r-email">Email receptor</Label>
            <Input
              id="r-email"
              type="email"
              value={receiverEmail}
              onChange={(e) => setReceiverEmail(e.target.value)}
              placeholder="cliente@empresa.cl"
              className="h-10 sm:h-9"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="r-item">Concepto / nombre del item *</Label>
              <Input
                id="r-item"
                value={itemName}
                onChange={(e) => setItemName(e.target.value)}
                className="h-10 sm:h-9"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="r-price">
                {currency === "UF" ? "Precio (UF) *" : "Precio (CLP) *"}
              </Label>
              <Input
                id="r-price"
                type="number"
                step={currency === "UF" ? "0.0001" : "1"}
                value={unitPrice}
                onChange={(e) => setUnitPrice(e.target.value)}
                placeholder={currency === "UF" ? "26.3158" : "1000000"}
                className="h-10 sm:h-9"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label>Frecuencia *</Label>
              <Select
                value={frequency}
                onValueChange={(v) =>
                  setFrequency(v as "monthly" | "biweekly" | "weekly" | "yearly")
                }
              >
                <SelectTrigger className="h-10 sm:h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="monthly">Mensual</SelectItem>
                  <SelectItem value="biweekly">Quincenal</SelectItem>
                  <SelectItem value="weekly">Semanal</SelectItem>
                  <SelectItem value="yearly">Anual</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {(frequency === "monthly" || frequency === "yearly") && (
              <div className="space-y-1.5">
                <Label htmlFor="r-dom">Día del mes *</Label>
                <Input
                  id="r-dom"
                  type="number"
                  min={-1}
                  max={31}
                  value={dayOfMonth}
                  onChange={(e) => setDayOfMonth(e.target.value)}
                  placeholder="1, 20, -1 (último)"
                  className="h-10 sm:h-9"
                />
                <p className="text-[12px] text-muted-foreground">
                  Usá -1 para "último día del mes".
                </p>
              </div>
            )}
            {(frequency === "weekly" || frequency === "biweekly") && (
              <div className="space-y-1.5">
                <Label>Día de la semana *</Label>
                <Select value={dayOfWeek} onValueChange={setDayOfWeek}>
                  <SelectTrigger className="h-10 sm:h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">Lunes</SelectItem>
                    <SelectItem value="2">Martes</SelectItem>
                    <SelectItem value="3">Miércoles</SelectItem>
                    <SelectItem value="4">Jueves</SelectItem>
                    <SelectItem value="5">Viernes</SelectItem>
                    <SelectItem value="6">Sábado</SelectItem>
                    <SelectItem value="0">Domingo</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="r-start">Empieza el *</Label>
              <Input
                id="r-start"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="h-10 sm:h-9"
              />
            </div>
          </div>

          {currency === "UF" && (
            <div className="rounded-md border border-status-info-border bg-status-info-soft p-3 space-y-2">
              <p className="text-[13px] font-medium text-status-info-fg">
                Política de fijación de UF
              </p>
              <p className="text-[12px] text-status-info-fg/80">
                Define qué UF se usa para convertir a CLP cuando el cron
                genera el borrador. Una vez generado, el monto en CLP se
                congela.
              </p>
              <Select
                value={ufFixingPolicy}
                onValueChange={(v) =>
                  setUfFixingPolicy(
                    v as
                      | "RUN_DAY"
                      | "LAST_DAY_PREV_MONTH"
                      | "FIRST_DAY_MONTH"
                      | "LAST_DAY_MONTH"
                      | "CUSTOM_DAY",
                  )
                }
              >
                <SelectTrigger className="h-10 sm:h-9 bg-background">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="LAST_DAY_PREV_MONTH">
                    UF del último día del mes anterior (recomendado)
                  </SelectItem>
                  <SelectItem value="FIRST_DAY_MONTH">
                    UF del primer día del mes en curso
                  </SelectItem>
                  <SelectItem value="LAST_DAY_MONTH">
                    UF del último día del mes en curso
                  </SelectItem>
                  <SelectItem value="RUN_DAY">
                    UF del día de generación
                  </SelectItem>
                  <SelectItem value="CUSTOM_DAY">
                    UF de un día específico del mes
                  </SelectItem>
                </SelectContent>
              </Select>
              {ufFixingPolicy === "CUSTOM_DAY" && (
                <div className="space-y-1.5">
                  <Label htmlFor="r-uf-day">Día del mes para tomar UF</Label>
                  <Input
                    id="r-uf-day"
                    type="number"
                    min={1}
                    max={31}
                    value={ufFixingDay}
                    onChange={(e) => setUfFixingDay(e.target.value)}
                    className="h-10 sm:h-9 bg-background"
                  />
                </div>
              )}
            </div>
          )}

          <label className="flex items-start gap-2 text-[13px]">
            <input
              type="checkbox"
              checked={autoSendEmail}
              onChange={(e) => setAutoSendEmail(e.target.checked)}
              className="mt-0.5"
            />
            <span>
              Enviar email automáticamente al receptor cuando emita el borrador
              (podés desmarcar después en cada emisión).
            </span>
          </label>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={submitting}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting && <Loader2 className="size-4 animate-spin mr-1.5" />}
            Crear plantilla
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
