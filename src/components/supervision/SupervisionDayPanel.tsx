"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  Clock,
  MapPinOff,
  Moon,
  Siren,
  Sun,
} from "lucide-react";
import { toast } from "sonner";
import { IncidenteStatusBadge } from "@/components/incidentes/IncidenteStatusBadge";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { EmptyState, Spinner, Tag } from "@/components/opai-ds";
import {
  formatChileTime,
  isPendingValidation,
  type GrillaIncident,
  type GrillaVisit,
  type ShiftFilter,
} from "@/lib/supervision-grilla";

type DayFinding = {
  id: string;
  visitId: string;
  category: string;
  severity: string;
  description: string;
  status: string;
};

type DayVisit = GrillaVisit & { findings: DayFinding[] };

type DayPayload = {
  installation: { id: string; name: string };
  year: number;
  month: number;
  day: number;
  visits: DayVisit[];
  incidents: GrillaIncident[];
  findings: DayFinding[];
};

const CATEGORY_LABELS: Record<string, string> = {
  personal: "Personal",
  infrastructure: "Infraestructura",
  documentation: "Documentación",
  operational: "Operativo",
};

const SEVERITY_LABELS: Record<string, string> = {
  critical: "Crítico",
  major: "Mayor",
  minor: "Menor",
};

function visitFlags(v: GrillaVisit): string[] {
  const flags: string[] = [];
  if (v.crossedShift) flags.push("Cruzó turno");
  if (v.noCheckout) flags.push("Sin salida");
  if (v.shortVisit) flags.push("Corta");
  if (v.outsideGeofence) flags.push("Fuera de geocerca");
  return flags;
}

export function SupervisionDayPanel({
  target,
  shift,
  onClose,
  onChanged,
}: {
  target: {
    installationId: string;
    name: string;
    year: number;
    month: number;
    day: number;
  } | null;
  shift: ShiftFilter;
  onClose: () => void;
  onChanged?: () => void;
}) {
  const [data, setData] = useState<DayPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!target) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        installationId: target.installationId,
        year: String(target.year),
        month: String(target.month),
        day: String(target.day),
        shift,
      });
      const res = await fetch(`/api/ops/supervision/grilla/day?${params}`);
      const json = await res.json();
      if (!res.ok || !json.success) {
        setError(json.error ?? "No se pudo cargar el día");
        setData(null);
        return;
      }
      setData(json.data as DayPayload);
    } catch {
      setError("Error de conexión");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [target, shift]);

  useEffect(() => {
    if (target) void load();
    else {
      setData(null);
      setError(null);
    }
  }, [target, load]);

  async function act(id: string, action: "validar" | "rechazar") {
    let reason = "";
    if (action === "rechazar") {
      reason = window.prompt("Motivo para devolver al guardia")?.trim() ?? "";
      if (reason.length < 4) return;
    }
    setBusyId(id);
    try {
      const res = await fetch("/api/ops/supervision/incidentes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticketId: id, action, reason }),
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error ?? "No se pudo completar");
        return;
      }
      toast.success(action === "validar" ? "Incidente validado" : "Incidente devuelto al guardia");
      await load();
      onChanged?.();
    } catch {
      toast.error("Error de conexión");
    } finally {
      setBusyId(null);
    }
  }

  const dateLabel = target
    ? new Date(target.year, target.month - 1, target.day).toLocaleDateString("es-CL", {
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : "";

  return (
    <Sheet open={!!target} onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 overflow-y-auto p-0 sm:max-w-md"
      >
        <SheetHeader className="border-b border-ds-border-subtle px-4 py-4 pr-14 sm:px-5">
          <SheetTitle className="text-base">
            {target?.name ?? "Instalación"}
          </SheetTitle>
          <SheetDescription className="text-[13px]">
            {dateLabel}. Visitas de supervisión, hallazgos de esas visitas e incidentes del día.
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 space-y-6 px-4 py-4 sm:px-5">
          {loading ? (
            <div className="flex justify-center py-10">
              <Spinner />
            </div>
          ) : error ? (
            <EmptyState
              compact
              icon={AlertTriangle}
              tone="warn"
              title="No se pudo cargar"
              description={error}
              action={
                <Button type="button" variant="outline" size="sm" onClick={() => void load()}>
                  Reintentar
                </Button>
              }
            />
          ) : data ? (
            <>
              <section className="space-y-2">
                <h3 className="text-[12px] font-mono uppercase tracking-wide text-ds-text-4">
                  Visitas
                </h3>
                {data.visits.length === 0 ? (
                  <p className="text-[13px] text-ds-text-3">Sin visitas en este turno.</p>
                ) : (
                  <ul className="space-y-2">
                    {data.visits.map((v) => {
                      const flags = visitFlags(v);
                      return (
                        <li
                          key={v.id}
                          className="rounded-lg border border-ds-border-default bg-ds-surface-1 p-3 space-y-2"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <p className="font-medium text-[13px]">{v.supervisorName}</p>
                            {v.shift === "night" ? (
                              <span className="inline-flex h-5 items-center gap-1 rounded-full border border-tint-violet-fg/30 bg-tint-violet px-2 text-[12px] font-medium text-tint-violet-fg">
                                <Moon className="h-3 w-3" />
                                Noche
                              </span>
                            ) : (
                              <Tag variant="ok" size="sm" icon={Sun}>
                                Día
                              </Tag>
                            )}
                          </div>
                          <p className="text-[13px] text-ds-text-2">
                            {formatChileTime(v.checkInAt)}
                            {" → "}
                            {v.checkOutAt ? formatChileTime(v.checkOutAt) : "Sin salida"}
                            {" · "}
                            {v.durationLabel}
                          </p>
                          {flags.length > 0 && (
                            <div className="flex flex-wrap gap-1">
                              {flags.map((f) => (
                                <Tag
                                  key={f}
                                  size="sm"
                                  variant={f === "Fuera de geocerca" ? "danger" : "warn"}
                                  icon={f === "Fuera de geocerca" ? MapPinOff : Clock}
                                >
                                  {f}
                                </Tag>
                              ))}
                            </div>
                          )}
                          <Link
                            href={`/ops/supervision/${v.id}`}
                            className="inline-flex min-h-11 items-center text-[13px] font-medium text-primary"
                            onClick={onClose}
                          >
                            Ver visita
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>

              <section className="space-y-2">
                <h3 className="text-[12px] font-mono uppercase tracking-wide text-ds-text-4">
                  Hallazgos de las visitas
                </h3>
                {data.findings.length === 0 ? (
                  <p className="text-[13px] text-ds-text-3">
                    Sin hallazgos en las visitas de este día.
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {data.findings.map((f) => (
                      <li
                        key={f.id}
                        className="rounded-lg border border-ds-border-default bg-ds-surface-1 p-3 space-y-1"
                      >
                        <div className="flex flex-wrap gap-1">
                          <Tag size="sm" variant={f.severity === "critical" ? "danger" : f.severity === "major" ? "warn" : "neutral"}>
                            {SEVERITY_LABELS[f.severity] ?? f.severity}
                          </Tag>
                          <Tag size="sm" variant="neutral">
                            {CATEGORY_LABELS[f.category] ?? f.category}
                          </Tag>
                        </div>
                        <p className="text-[13px]">{f.description}</p>
                        <Link
                          href={`/ops/supervision/${f.visitId}`}
                          className="inline-flex min-h-11 items-center text-[13px] font-medium text-primary"
                          onClick={onClose}
                        >
                          Ir a la visita
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section className="space-y-2">
                <h3 className="text-[12px] font-mono uppercase tracking-wide text-ds-text-4">
                  Incidentes del día
                </h3>
                {data.incidents.length === 0 ? (
                  <p className="text-[13px] text-ds-text-3">Sin incidentes en este turno.</p>
                ) : (
                  <ul className="space-y-2">
                    {data.incidents.map((inc) => (
                      <li
                        key={inc.id}
                        className="rounded-lg border border-ds-border-default bg-ds-surface-1 p-3 space-y-2"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="font-mono text-[12px] text-ds-text-3">{inc.code}</p>
                            <p className="text-[13px] font-medium">{inc.title}</p>
                          </div>
                          <IncidenteStatusBadge status={inc.status} />
                        </div>
                        {isPendingValidation(inc.status) ? (
                          <div className="flex gap-2">
                            <button
                              type="button"
                              className="min-h-11 flex-1 rounded-xl border border-ds-border-default text-[13px]"
                              disabled={busyId === inc.id}
                              onClick={() => void act(inc.id, "rechazar")}
                            >
                              Rechazar
                            </button>
                            <button
                              type="button"
                              className="min-h-11 flex-1 rounded-xl bg-primary text-primary-foreground font-semibold text-[13px]"
                              disabled={busyId === inc.id}
                              onClick={() => void act(inc.id, "validar")}
                            >
                              Validar
                            </button>
                          </div>
                        ) : (
                          <Link
                            href={`/ops/tickets/${inc.id}`}
                            className="inline-flex min-h-11 items-center gap-1 text-[13px] font-medium text-primary"
                            onClick={onClose}
                          >
                            <Siren className="h-3.5 w-3.5" />
                            Ver incidente
                          </Link>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </>
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}
