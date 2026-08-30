"use client";

import { Button } from "@/components/ui/button";
import { Check, Clock, Info, LogOut, MapPin, RotateCcw, Trash2, X } from "lucide-react";
import { formatPersonName } from "@/lib/personas";
import type { AsistenciaItem, AttendanceStatus } from "@/types/ops-asistencia";
import {
  STATUS_CONFIG,
  ADHOC_REASON_LABELS,
  isDayShift,
  isDescubiertoPorRetiro,
  getActiveTe,
  hasChanges as itemHasChanges,
} from "@/types/ops-asistencia";

function timeFromISO(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
}

interface AsistenciaShiftCardProps {
  item: AsistenciaItem;
  isDesktop: boolean;
  canExecuteOps: boolean;
  savingId: string | null;
  onMarkPresent: (item: AsistenciaItem) => void;
  onMarkAbsent: (item: AsistenciaItem) => void;
  onAssignReplacement: (item: AsistenciaItem) => void;
  onReset: (item: AsistenciaItem) => void;
  onViewMarcacion: (marcaciones: AsistenciaItem["marcaciones"]) => void;
  onEarlyDeparture?: (item: AsistenciaItem) => void;
  onCoverEarlyDeparture?: (item: AsistenciaItem) => void;
  onDeleteAdhoc?: (item: AsistenciaItem) => void;
}

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
  onEarlyDeparture,
  onCoverEarlyDeparture,
  onDeleteAdhoc,
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
  const canEarlyLeave =
    status === "asistio" && Boolean(item.checkInAt) && !isLocked && canExecuteOps;
  const descubiertoRetiro = isDescubiertoPorRetiro(item);
  const coveredEarly =
    Boolean(item.earlyDepartureAt) &&
    Boolean(te) &&
    (te?.status === "pending" || te?.status === "approved" || te?.status === "paid");
  const adhocLabel = item.isAdhoc
    ? `Ad-hoc · ${ADHOC_REASON_LABELS[item.adhocReason ?? ""] ?? item.adhocReason ?? "Otro"}`
    : null;

  const badges = (
    <>
      {adhocLabel && (
        <span className="inline-flex items-center rounded-full bg-tint-violet px-2 py-0.5 text-[12px] font-medium text-tint-violet-fg">
          {adhocLabel}
        </span>
      )}
      {descubiertoRetiro && (
        <span className="inline-flex items-center gap-1 rounded-full bg-tint-amber px-2 py-0.5 text-[12px] font-medium text-tint-amber-fg">
          Retiro anticipado · sin cobertura
        </span>
      )}
      {coveredEarly && (
        <span className="inline-flex items-center rounded-full bg-tint-amber/60 px-2 py-0.5 text-[12px] font-medium text-tint-amber-fg">
          Retiro anticipado · cubierto (TE)
        </span>
      )}
    </>
  );

  const earlyActions = (
    <>
      {canEarlyLeave && !item.earlyDepartureAt && onEarlyDeparture && (
        <Button
          size="sm"
          variant="outline"
          className="h-10 sm:h-8 text-xs px-2 border-status-warn-border text-status-warn-fg"
          disabled={isSaving}
          onClick={() => onEarlyDeparture(item)}
          title="Se retiró antes"
        >
          <LogOut className="h-3.5 w-3.5 mr-1" />
          Se retiró antes
        </Button>
      )}
      {descubiertoRetiro && onCoverEarlyDeparture && (
        <Button
          size="sm"
          variant="outline"
          className="h-10 sm:h-8 text-xs px-2"
          disabled={isSaving || isLocked || !canExecuteOps}
          onClick={() => onCoverEarlyDeparture(item)}
        >
          Cubrir
        </Button>
      )}
      {item.isAdhoc &&
        status !== "reemplazo" &&
        !(te?.status === "approved" || te?.status === "paid") &&
        onDeleteAdhoc && (
          <Button
            size="sm"
            variant="ghost"
            className="h-10 w-10 sm:h-8 sm:w-8 p-0 text-status-danger-fg"
            disabled={isSaving || isLocked || !canExecuteOps}
            onClick={() => onDeleteAdhoc(item)}
            title="Eliminar PPC ad-hoc"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        )}
    </>
  );

  if (!isDesktop) {
    return (
      <div
        className={`rounded-lg border-l-[3px] ${cfg.border} ${cfg.bg} px-3 py-2 space-y-1 ${isLocked ? "opacity-60" : ""}`}
      >
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
          <div className="flex items-center gap-1 shrink-0">
            {showAsistioNoAsistio && (
              <>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-10 w-10 p-0 text-status-ok-fg hover:bg-status-ok-soft"
                  disabled={isSaving || isLocked || !canExecuteOps || status === "no_asistio"}
                  onClick={() => onMarkPresent(item)}
                  title="Asistió"
                >
                  <Check className="h-3.5 w-3.5" />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-10 w-10 p-0 text-status-danger-fg hover:bg-status-danger-soft"
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
                className="h-10 text-xs px-2"
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
                className="h-10 w-10 p-0 text-muted-foreground"
                disabled={isSaving || isLocked || !canExecuteOps}
                onClick={() => onReset(item)}
                title="Resetear"
              >
                <RotateCcw className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        </div>

        {(adhocLabel || descubiertoRetiro || coveredEarly) && (
          <div className="flex flex-wrap gap-1.5 pl-7">{badges}</div>
        )}

        <div className="flex items-center gap-1.5 text-[12px] text-muted-foreground pl-7">
          <span>S{item.slotNumber}</span>
          <span>·</span>
          <span>{item.puesto.name}</span>
          <span>·</span>
          <span>
            {item.plannedShiftStart ?? item.puesto.shiftStart}-
            {item.plannedShiftEnd ?? item.puesto.shiftEnd}
          </span>
          <span className="text-status-info-fg">
            {isDayShift(item.puesto.shiftStart) ? "Día" : "Noche"}
          </span>
        </div>

        {(canEarlyLeave || descubiertoRetiro || item.isAdhoc) && (
          <div className="flex flex-wrap gap-1.5 pl-7 pt-0.5">{earlyActions}</div>
        )}

        {status === "reemplazo" && item.replacementGuardia && (
          <div className="flex items-center gap-1.5 text-xs pl-7">
            <span className="text-violet-400">
              ↺{" "}
              {formatPersonName(
                item.replacementGuardia.persona.firstName,
                item.replacementGuardia.persona.lastName
              )}
            </span>
            {te && (
              <span className="text-status-warn-fg">
                {te.status} (${Number(te.amountClp).toLocaleString("es-CL")})
                {te.amountJustification && (
                  <span title={te.amountJustification ?? undefined}>
                    <Info className="h-3 w-3 text-status-warn-fg inline ml-0.5" />
                  </span>
                )}
              </span>
            )}
          </div>
        )}

        {status !== "reemplazo" && item.marcaciones && item.marcaciones.length > 0 && (
          <div className="flex items-center gap-1.5 text-xs pl-7">
            {(() => {
              const entrada = item.marcaciones
                .filter((m) => m.tipo === "entrada")
                .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())[0];
              const salida = item.marcaciones
                .filter((m) => m.tipo === "salida")
                .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
                .pop();
              return (
                <>
                  {entrada && (
                    <span className="text-status-ok-fg inline-flex items-center gap-0.5">
                      <Clock className="h-3 w-3" />
                      {new Date(entrada.timestamp).toLocaleTimeString("es-CL", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  )}
                  {salida && (
                    <span className="text-status-warn-fg inline-flex items-center gap-0.5">
                      <MapPin className="h-3 w-3" />
                      {new Date(salida.timestamp).toLocaleTimeString("es-CL", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
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

        {status === "asistio" &&
          (!item.marcaciones || item.marcaciones.length === 0) &&
          (item.checkInAt || item.checkOutAt) && (
            <div className="text-xs pl-7 text-muted-foreground">
              {timeFromISO(item.checkInAt)} – {timeFromISO(item.checkOutAt)}
            </div>
          )}
      </div>
    );
  }

  return (
    <div
      className={`rounded-lg border border-border/60 p-2 min-w-0 overflow-hidden ${isLocked ? "opacity-60" : ""} grid grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1.2fr)_minmax(0,150px)_auto] gap-x-3 items-start`}
    >
      <div className="flex items-center gap-2 min-w-0">
        <span title={item.attendanceStatus} className="text-base shrink-0">
          {cfg.icon}
        </span>
        <div className="min-w-0">
          <div className="font-medium text-sm leading-tight">{item.puesto.name}</div>
          <div className="text-xs text-muted-foreground leading-tight">
            S{item.slotNumber} · {item.plannedShiftStart ?? item.puesto.shiftStart}-
            {item.plannedShiftEnd ?? item.puesto.shiftEnd}{" "}
            <span className="text-status-info-fg">
              {isDayShift(item.puesto.shiftStart) ? "Día" : "Noche"}
            </span>
          </div>
          <div className="flex flex-wrap gap-1 mt-0.5">{badges}</div>
          {item.plannedGuardiaId && (
            <div className="flex flex-wrap items-center gap-1 mt-0.5">
              <span className="text-[12px] text-muted-foreground">
                T:{((item.workedMinutes ?? 0) / 60).toFixed(1)}h
              </span>
              <span className="text-[12px] text-muted-foreground">
                J:{((item.plannedMinutes ?? 0) / 60).toFixed(1)}h
              </span>
              {(item.overtimeMinutes ?? 0) > 0 && (
                <span className="text-[12px] text-status-warn-fg font-medium">
                  HE:{((item.overtimeMinutes ?? 0) / 60).toFixed(1)}h
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 text-sm min-w-0">
        {item.plannedGuardia ? (
          <span className="truncate flex items-center gap-2">
            {formatPersonName(
              item.plannedGuardia.persona.firstName,
              item.plannedGuardia.persona.lastName
            )}
            {item.plannedGuardia.code && (
              <span className="text-xs text-muted-foreground">({item.plannedGuardia.code})</span>
            )}
          </span>
        ) : (
          <span className="text-status-warn-fg text-sm">Sin asignar (PPC)</span>
        )}
      </div>

      <div className="text-sm min-w-0 flex items-center">
        {status === "reemplazo" && item.replacementGuardia ? (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-status-danger-fg">
              {formatPersonName(
                item.replacementGuardia.persona.firstName,
                item.replacementGuardia.persona.lastName
              )}
            </span>
            {te && (
              <span className="text-xs text-status-warn-fg ml-2 inline-flex items-center gap-1">
                TE {te.status} (${Number(te.amountClp).toLocaleString("es-CL")})
                {te.amountJustification && (
                  <span title={te.amountJustification ?? undefined}>
                    <Info className="h-3 w-3 text-status-warn-fg inline" />
                  </span>
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
        ) : coveredEarly && te ? (
          <span className="text-xs text-status-warn-fg">
            Cobertura TE · {te.status} (${Number(te.amountClp).toLocaleString("es-CL")})
          </span>
        ) : (
          <span className="text-muted-foreground text-sm">—</span>
        )}
      </div>

      <div className="text-sm min-w-0 flex items-center">
        {status === "reemplazo" ? (
          <span className="text-muted-foreground text-xs">—</span>
        ) : item.marcaciones && item.marcaciones.length > 0 ? (
          <div className="flex flex-wrap items-center gap-1.5">
            {(() => {
              const entrada = item.marcaciones
                .filter((m) => m.tipo === "entrada")
                .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())[0];
              const salida = item.marcaciones
                .filter((m) => m.tipo === "salida")
                .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
                .pop();
              return (
                <>
                  {entrada && (
                    <span className="inline-flex items-center gap-0.5 text-xs text-status-ok-fg">
                      <Clock className="h-3.5 w-3.5" />
                      {new Date(entrada.timestamp).toLocaleTimeString("es-CL", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  )}
                  {salida && (
                    <span className="inline-flex items-center gap-0.5 text-xs text-status-warn-fg">
                      <MapPin className="h-3.5 w-3.5" />
                      {new Date(salida.timestamp).toLocaleTimeString("es-CL", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
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
            <span className="text-status-ok-fg">{timeFromISO(item.checkInAt)}</span>
            <span className="text-muted-foreground">–</span>
            <span className="text-status-warn-fg">{timeFromISO(item.checkOutAt)}</span>
          </span>
        ) : (
          <span className="text-muted-foreground text-xs">—</span>
        )}
      </div>

      <div className="flex flex-col items-end justify-center gap-2">
        <div className="flex flex-wrap gap-1.5 items-center justify-end">
          {showAsistioNoAsistio && (
            <>
              <Button
                size="sm"
                variant="outline"
                className="h-9 w-9 p-0 border-status-ok-border text-status-ok-fg hover:bg-status-ok-soft"
                disabled={isSaving || isLocked || !canExecuteOps || status === "no_asistio"}
                onClick={() => onMarkPresent(item)}
                title="Asistió"
              >
                <Check className="h-3.5 w-3.5" />
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-9 w-9 p-0 border-status-danger-border text-status-danger-fg hover:bg-status-danger-soft"
                disabled={isSaving || isLocked || !canExecuteOps}
                onClick={() => onMarkAbsent(item)}
                title="No asistió"
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </>
          )}
          {earlyActions}
          {canReset && (
            <Button
              size="sm"
              variant="ghost"
              className="h-9 text-xs px-2 text-muted-foreground"
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
