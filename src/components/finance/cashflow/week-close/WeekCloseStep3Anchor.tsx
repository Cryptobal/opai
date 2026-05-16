"use client";
import { Lock, Unlock } from "lucide-react";
import type { WeeklyCloseSnapshotDTO, VarianceResolution } from "./types";
import { fmtCLP } from "./types";

interface Props {
  snap: WeeklyCloseSnapshotDTO;
  anchor: boolean;
  onAnchorChange: (v: boolean) => void;
  varianceResolution: VarianceResolution;
  onVarianceResolutionChange: (v: VarianceResolution) => void;
}

/**
 * Paso 3 del cierre semanal: decidir si este cierre se vuelve anchor de la
 * proyección hacia adelante, y registrar cómo se resuelve la diferencia
 * (drift) de la semana para auditoría.
 *
 * Anchor=true → projection.service rebasa runningProjected desde
 * snap.bankBalanceClp para todos los buckets con start > weekEndDate.
 */
export function WeekCloseStep3Anchor({
  snap,
  anchor,
  onAnchorChange,
  varianceResolution,
  onVarianceResolutionChange,
}: Props) {
  const hasDrift = Math.abs(snap.varianceClp) >= 50_000;
  const weekEndLabel = new Date(snap.weekEndDate).toLocaleDateString("es-CL", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

  return (
    <section className="space-y-3">
      <h3 className="text-sm font-semibold flex items-center gap-2">
        <Lock className="h-4 w-4 text-ds-text-3" />
        3. Anclar proyección
      </h3>

      <label className="flex items-start gap-2.5 rounded-md border border-border/60 px-3 py-2.5 cursor-pointer hover:bg-muted/30">
        <input
          type="checkbox"
          checked={anchor}
          onChange={(e) => onAnchorChange(e.target.checked)}
          className="mt-1"
        />
        <div className="flex-1 text-sm">
          <div className="flex items-center gap-1.5 font-medium">
            {anchor ? (
              <Lock className="h-3.5 w-3.5 text-status-info-fg" />
            ) : (
              <Unlock className="h-3.5 w-3.5 text-ds-text-3" />
            )}
            Anclar proyección al saldo banco real
          </div>
          {anchor ? (
            <p className="text-xs text-muted-foreground mt-1">
              Las semanas futuras partirán desde{" "}
              <strong>{fmtCLP.format(snap.bankBalanceClp)}</strong>. Las semanas
              anteriores quedarán congeladas como histórico al cierre del{" "}
              {weekEndLabel}.
            </p>
          ) : (
            <p className="text-xs text-muted-foreground mt-1">
              Sin anclar: la proyección sigue partiendo del opening tradicional
              y el drift se arrastra.
            </p>
          )}
        </div>
      </label>

      {hasDrift && (
        <fieldset className="rounded-md border border-border/60 px-3 py-2.5 space-y-1.5">
          <legend className="text-xs font-medium text-ds-text-2 px-1">
            Cómo cierras la diferencia
          </legend>
          <label className="flex items-start gap-2 text-sm cursor-pointer">
            <input
              type="radio"
              name="varianceRes"
              checked={varianceResolution === "ADJUSTED"}
              onChange={() => onVarianceResolutionChange("ADJUSTED")}
              className="mt-1"
            />
            <span>
              <strong>Cerrada con ajuste contable</strong>
              <span className="block text-xs text-muted-foreground">
                Ya creé al menos un ajuste que neutraliza la diferencia.
              </span>
            </span>
          </label>
          <label className="flex items-start gap-2 text-sm cursor-pointer">
            <input
              type="radio"
              name="varianceRes"
              checked={varianceResolution === "ACCEPTED"}
              onChange={() => onVarianceResolutionChange("ACCEPTED")}
              className="mt-1"
            />
            <span>
              <strong>Aceptada como histórico</strong>
              <span className="block text-xs text-muted-foreground">
                La asumo como diferencia legítima sin ajuste extra.
              </span>
            </span>
          </label>
          <label className="flex items-start gap-2 text-sm cursor-pointer">
            <input
              type="radio"
              name="varianceRes"
              checked={varianceResolution === "PENDING"}
              onChange={() => onVarianceResolutionChange("PENDING")}
              className="mt-1"
            />
            <span>
              <strong>Pendiente</strong>
              <span className="block text-xs text-muted-foreground">
                Cierro hoy pero queda por resolver más tarde.
              </span>
            </span>
          </label>
        </fieldset>
      )}
    </section>
  );
}
