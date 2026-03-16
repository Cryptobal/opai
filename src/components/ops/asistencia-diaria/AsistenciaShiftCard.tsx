"use client";

import { Button } from "@/components/ui/button";
import { Check, Clock, Info, MapPin, RotateCcw, X } from "lucide-react";
import { formatPersonName } from "@/lib/personas";
import type { AsistenciaItem, AttendanceStatus } from "@/types/ops-asistencia";
import {
  STATUS_CONFIG,
  isDayShift,
  getActiveTe,
  getInitialStatus,
  hasChanges as itemHasChanges,
} from "@/types/ops-asistencia";

/* ── Time helper ─────────────────────────────────────────────────────── */

function timeFromISO(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
}

/* ── Props ────────────────────────────────────────────────────────────── */

interface AsistenciaShiftCardProps {
  item: AsistenciaItem;
  isDesktop: boolean;
  canExecuteOps: boolean;
  savingId: string | null;
  // Actions
  onMarkPresent: (item: AsistenciaItem) => void;
  onMarkAbsent: (item: AsistenciaItem) => void;
  onAssignReplacement: (item: AsistenciaItem) => void;
  onReset: (item: AsistenciaItem) => void;
  onViewMarcacion: (marcaciones: AsistenciaItem["marcaciones"]) => void;
}

/* ── Component ────────────────────────────────────────────────────────── */

export function AsistenciaShiftCard({
  item,
  isDesktop,
  canExecuteOps,
  savingId,
  onMarkPresent,
  onMarkAbsent,
  onAssignReplacement,
  onReset,
  onViewMarcacion,
}: AsistenciaShiftCardProps) {
  const te = getActiveTe(item);
  const isLocked = Boolean(item.lockedAt);
  const isPPC = !item.plannedGuardiaId;
  const status = item.attendanceStatus as AttendanceStatus;
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.pendiente;
  const tieneReemplazoAsignado = status === "reemplazo" && item.replacementGuardiaId;
  const showAsistioNoAsistio = !isPPC && status !== "asistio" && !tieneReemplazoAsignado;
  const showReplacementButton =
    isPPC || status === "no_asistio" || (status === "reemplazo" && item.replacementGuardia);
  const canReset = itemHasChanges(item);
  const isSaving = savingId === item.id;

  // ── Mobile layout ─────────────────────────────────────────────────────

  if (!isDesktop) {
    return (
      <div
        className={`rounded-lg border-l-[3px] ${cfg.border} ${cfg.bg} px-3 py-2 space-y-1 ${isLocked ? "opacity-60" : ""}`}
      >
        {/* Row 1: Status icon + guard name + actions */}
        <div className="flex items-center gap-2 min-w-0">
          <span className={`text-sm font-bold ${cfg.color} shrink-0 w-5 text-center`}>
            {cfg.icon}
          </span>
          <div className="flex-1 min-w-0">
            <span className="text-sm font-medium truncate block">
              {item.plannedGuardia
                ? formatPersonName(
                    item.plannedGuardia.persona.firstName,
                    item.plannedGuardia.persona.lastName
                  )
                : "Sin asignar (PPC)"}
            </span>
          </div>
          {/* Inline actions */}
          <div className="flex items-center gap-1 shrink-0">
            {showAsistioNoAsistio && (
              <>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 w-7 p-0 text-emerald-400 hover:bg-emerald-500/20"
                  disabled={isSaving || isLocked || !canExecuteOps || status === "no_asistio"}
                  onClick={() => onMarkPresent(item)}
                  title="Asistió"
                >
                  <Check className="h-3.5 w-3.5" />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 w-7 p-0 text-red-400 hover:bg-red-500/20"
                  disabled={isSaving || isLocked || !canExecuteOps}
                  onClick={() => onMarkAbsent(item)}
                  title="No asistió"
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              </>
            )}
            {showReplacementButton && !tieneReemplazoAsignado && (isPPC || status === "no_asistio") && (
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs px-2"
                disabled={isSaving || isLocked || !canExecuteOps}
                onClick={() => onAssignReplacement(item)}
              >
                Asignar
              </Button>
            )}
            {canReset && (
              <Button
                size="sm"
                variant="ghost"
                className="h-7 w-7 p-0 text-muted-foreground"
                disabled={isSaving || isLocked || !canExecuteOps}
                onClick={() => onReset(item)}
                title="Resetear"
              >
                <RotateCcw className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        </div>

        {/* Row 2: Position details */}
        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground pl-7">
          <span>S{item.slotNumber}</span>
          <span>·</span>
          <span>{item.puesto.name}</span>
          <span>·</span>
          <span>
            {item.puesto.shiftStart}-{item.puesto.shiftEnd}
          </span>
          <span
            className={
              isDayShift(item.puesto.shiftStart) ? "text-sky-400" : "text-indigo-400"
            }
          >
            {isDayShift(item.puesto.shiftStart) ? "Día" : "Noche"}
          </span>
        </div>

        {/* Row 3: Replacement info (if any) */}
        {status === "reemplazo" && item.replacementGuardia && (
          <div className="flex items-center gap-1.5 text-xs pl-7">
            <span className="text-violet-400">
              ↺{" "}
              {formatPersonName(
                item.replacementGuardia.persona.firstName,
                item.replacementGuardia.persona.lastName
              )}
            </span>
            {item.replacementGuardia.lifecycleStatus === "te" && (
              <span className="inline-flex items-center rounded-full bg-violet-500/20 px-1.5 py-0.5 text-[10px] font-medium text-violet-400">
                TE
              </span>
            )}
            {te && (
              <span className="text-amber-400">
                {te.status} (${Number(te.amountClp).toLocaleString("es-CL")})
                {te.amountJustification && (
                  <Info className="h-3 w-3 text-amber-300 inline ml-0.5" title={te.amountJustification} />
                )}
              </span>
            )}
          </div>
        )}

        {/* Row 4: Marcación info (if any) */}
        {status !== "reemplazo" && item.marcaciones && item.marcaciones.length > 0 && (
          <div className="flex items-center gap-1.5 text-xs pl-7">
            {(() => {
              const entrada = item.marcaciones.filter((m) => m.tipo === "entrada").sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())[0];
              const salida = item.marcaciones.filter((m) => m.tipo === "salida").sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()).pop();
              return (
                <>
                  {entrada && (
                    <span className="text-emerald-500 inline-flex items-center gap-0.5">
                      <Clock className="h-3 w-3" />
                      {new Date(entrada.timestamp).toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  )}
                  {salida && (
                    <span className="text-amber-500 inline-flex items-center gap-0.5">
                      <MapPin className="h-3 w-3" />
                      {new Date(salida.timestamp).toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  )}
                  {entrada?.metodoId === "face_id" && (
                    <span className="text-[10px] px-1 rounded bg-emerald-500/20 text-emerald-400 font-medium">Face ID</span>
                  )}
                  {(entrada?.metodoId === "pin_fallback" || entrada?.metodoId === "rut_pin") && (
                    <span className="text-[10px] px-1 rounded bg-amber-500/20 text-amber-400 font-medium">PIN</span>
                  )}
                  {entrada?.metodoId === "manual" && (
                    <span className="text-[10px] px-1 rounded bg-zinc-500/20 text-zinc-400 font-medium">Manual</span>
                  )}
                  <button
                    type="button"
                    className="text-xs text-primary hover:underline"
                    onClick={() => onViewMarcacion(item.marcaciones)}
                  >
                    Detalle
                  </button>
                </>
              );
            })()}
          </div>
        )}

        {/* Inline checkIn/out display when asistio without marcaciones */}
        {status === "asistio" && (!item.marcaciones || item.marcaciones.length === 0) && (item.checkInAt || item.checkOutAt) && (
          <div className="text-xs pl-7 text-muted-foreground">
            {timeFromISO(item.checkInAt)} – {timeFromISO(item.checkOutAt)}
          </div>
        )}
      </div>
    );
  }

  // ── Desktop layout (5-column grid) ────────────────────────────────────

  return (
    <div
      className={`rounded-lg border border-border/60 p-2 min-w-0 overflow-hidden ${isLocked ? "opacity-60" : ""} grid grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1.2fr)_minmax(0,150px)_auto] gap-x-3 items-start`}
    >
      {/* Col 1: Puesto + Slot + Horas */}
      <div className="flex items-center gap-2 min-w-0">
        <span title={item.attendanceStatus} className="text-base shrink-0">
          {cfg.icon}
        </span>
        <div className="min-w-0">
          <div className="font-medium text-sm leading-tight">{item.puesto.name}</div>
          <div className="text-xs text-muted-foreground leading-tight">
            S{item.slotNumber} · {item.puesto.shiftStart}-{item.puesto.shiftEnd}{" "}
            <span className={isDayShift(item.puesto.shiftStart) ? "text-sky-400" : "text-indigo-400"}>
              {isDayShift(item.puesto.shiftStart) ? "Día" : "Noche"}
            </span>
          </div>
          {item.plannedGuardiaId && (
            <div className="flex flex-wrap items-center gap-1 mt-0.5">
              <span className="text-[10px] text-muted-foreground">
                T:{((item.workedMinutes ?? 0) / 60).toFixed(1)}h
              </span>
              <span className="text-[10px] text-muted-foreground">
                J:{((item.plannedMinutes ?? 0) / 60).toFixed(1)}h
              </span>
              {(item.overtimeMinutes ?? 0) > 0 && (
                <span className="text-[10px] text-amber-300 font-medium">
                  HE:{((item.overtimeMinutes ?? 0) / 60).toFixed(1)}h
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Col 2: Planificado */}
      <div className="flex items-center gap-2 text-sm min-w-0">
        {item.plannedGuardia ? (
          <span className="truncate flex items-center gap-2">
            {formatPersonName(item.plannedGuardia.persona.firstName, item.plannedGuardia.persona.lastName)}
            {item.plannedGuardia.code && (
              <span className="text-xs text-muted-foreground">({item.plannedGuardia.code})</span>
            )}
            {item.plannedGuardia.lifecycleStatus === "te" && (
              <span className="inline-flex items-center rounded-full bg-violet-500/20 px-1.5 py-0.5 text-[10px] font-medium text-violet-400">
                TE
              </span>
            )}
          </span>
        ) : (
          <span className="text-amber-400 text-sm">Sin asignar (PPC)</span>
        )}
      </div>

      {/* Col 3: Reemplazo */}
      <div className="text-sm min-w-0 flex items-center">
        {status === "reemplazo" && item.replacementGuardia ? (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-rose-300">
              {formatPersonName(item.replacementGuardia.persona.firstName, item.replacementGuardia.persona.lastName)}
            </span>
            {item.replacementGuardia.lifecycleStatus === "te" && (
              <span className="inline-flex items-center rounded-full bg-violet-500/20 px-2 py-0.5 text-[10px] font-medium text-violet-400">
                TE
              </span>
            )}
            {te && (
              <span className="text-xs text-amber-400 ml-2 inline-flex items-center gap-1">
                {te.tipo === "hora_extra" ? `HHEE ${te.horasExtra ?? "?"}h` : "TE"}{" "}
                {te.status} (${Number(te.amountClp).toLocaleString("es-CL")})
                {te.amountJustification && (
                  <Info className="h-3 w-3 text-amber-300 inline" title={te.amountJustification} />
                )}
              </span>
            )}
          </div>
        ) : showReplacementButton && (isPPC || status === "no_asistio") ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-9 w-full justify-start text-sm font-normal"
            disabled={isSaving || isLocked || !canExecuteOps}
            onClick={() => onAssignReplacement(item)}
          >
            Buscar guardia…
          </Button>
        ) : (
          <span className="text-muted-foreground text-sm">—</span>
        )}
      </div>

      {/* Col 4: Marcación */}
      <div className="text-sm min-w-0 flex items-center">
        {status === "reemplazo" ? (
          <span className="text-muted-foreground text-xs">—</span>
        ) : item.marcaciones && item.marcaciones.length > 0 ? (
          <div className="flex flex-wrap items-center gap-1.5">
            {(() => {
              const entrada = item.marcaciones.filter((m) => m.tipo === "entrada").sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())[0];
              const salida = item.marcaciones.filter((m) => m.tipo === "salida").sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()).pop();
              return (
                <>
                  {entrada && (
                    <span className={`inline-flex items-center gap-0.5 text-xs ${entrada.gpsStatus === "fuera_rango" ? "text-yellow-500" : "text-emerald-500"}`}>
                      <Clock className="h-3.5 w-3.5" />
                      {new Date(entrada.timestamp).toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" })}
                      {entrada.gpsStatus === "fuera_rango" && (
                        <span className="ml-0.5 text-[9px] bg-yellow-500/20 text-yellow-400 px-1 rounded">GPS</span>
                      )}
                    </span>
                  )}
                  {salida && (
                    <span className={`inline-flex items-center gap-0.5 text-xs ${salida.gpsStatus === "fuera_rango" ? "text-yellow-500" : "text-amber-500"}`}>
                      <MapPin className="h-3.5 w-3.5" />
                      {new Date(salida.timestamp).toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" })}
                      {salida.gpsStatus === "fuera_rango" && (
                        <span className="ml-0.5 text-[9px] bg-yellow-500/20 text-yellow-400 px-1 rounded">GPS</span>
                      )}
                    </span>
                  )}
                  {entrada?.metodoId === "face_id" && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 font-medium">Face ID</span>
                  )}
                  {(entrada?.metodoId === "pin_fallback" || entrada?.metodoId === "rut_pin") && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400 font-medium">PIN</span>
                  )}
                  {entrada?.metodoId === "manual" && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-500/20 text-zinc-400 font-medium">Manual</span>
                  )}
                  <button
                    type="button"
                    className="text-xs text-primary hover:underline"
                    onClick={() => onViewMarcacion(item.marcaciones)}
                  >
                    Ver detalle
                  </button>
                </>
              );
            })()}
          </div>
        ) : (item.checkInAt || item.checkOutAt) && status === "asistio" ? (
          <span className="inline-flex items-center gap-1.5 text-xs">
            <span className="text-emerald-500">{timeFromISO(item.checkInAt)}</span>
            <span className="text-muted-foreground">–</span>
            <span className="text-amber-500">{timeFromISO(item.checkOutAt)}</span>
          </span>
        ) : (
          <span className="text-muted-foreground text-xs">—</span>
        )}
      </div>

      {/* Col 5: Actions */}
      <div className="flex flex-col items-end justify-center gap-2">
        <div className="flex flex-wrap gap-1.5 items-center">
          {showAsistioNoAsistio && (
            <>
              <Button
                size="sm"
                variant="outline"
                className="h-7 w-7 p-0 border-emerald-500/50 text-emerald-400 hover:bg-emerald-500/20"
                disabled={isSaving || isLocked || !canExecuteOps || status === "no_asistio"}
                onClick={() => onMarkPresent(item)}
                title="Asistió"
              >
                <Check className="h-3.5 w-3.5" />
              </Button>
              <Button
                size="sm"
                variant="outline"
                className={`h-7 w-7 p-0 ${
                  status === "no_asistio"
                    ? "border-rose-500 bg-rose-500/25 text-rose-300"
                    : "border-rose-500/50 text-rose-400 hover:bg-rose-500/20"
                }`}
                disabled={isSaving || isLocked || !canExecuteOps}
                onClick={() => onMarkAbsent(item)}
                title="No asistió"
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </>
          )}
          {canReset && (
            <Button
              size="sm"
              variant="ghost"
              className="h-8 text-xs px-2 text-muted-foreground"
              disabled={isSaving || isLocked || !canExecuteOps}
              onClick={() => onReset(item)}
              title="Resetear"
            >
              <RotateCcw className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
