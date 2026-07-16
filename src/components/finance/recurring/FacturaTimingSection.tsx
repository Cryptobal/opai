"use client";

import * as React from "react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { FacturaTimingFields } from "./FacturaTimingFields";
import {
  buildFacturaTimingPreview,
  type FacturaTimingValue,
} from "./factura-timing-preview";

export type { FacturaTimingValue };

interface Props {
  value: FacturaTimingValue;
  onChange: (next: FacturaTimingValue) => void;
  /** Día en que corre la programación (null si la frecuencia no lo usa). */
  progDayOfMonth: number | null;
  frequency: string;
}

const CARD =
  "w-full text-left rounded-md border p-3 min-h-[44px] transition-colors";
const CARD_ON = "border-status-info-fg bg-background";
const CARD_OFF = "border-border bg-background/40 hover:bg-background/70";

/**
 * "¿Cuándo se emite la factura real?" — define en qué fecha la programación se
 * convierte en factura y, por lo tanto, dónde se proyecta en el flujo de caja
 * mientras la factura no exista. El motor solo aplica timing a mensual/anual.
 */
export function FacturaTimingSection({
  value,
  onChange,
  progDayOfMonth,
  frequency,
}: Props) {
  const supportsTiming = frequency === "monthly" || frequency === "yearly";
  const progDay = progDayOfMonth ?? 1;
  const isEspecifico = value.facturaTiming === "DIA_ESPECIFICO";
  const preview = React.useMemo(
    () => (supportsTiming ? buildFacturaTimingPreview(value, progDay) : []),
    [value, progDay, supportsTiming],
  );

  return (
    <div className="rounded-md border border-status-info-border bg-status-info-soft p-3 space-y-3">
      <div className="space-y-1">
        <p className="text-[13px] font-medium text-status-info-fg">
          ¿Cuándo se emite la factura real?
        </p>
        <p className="text-[12px] text-status-info-fg/80">
          Define en qué fecha esta programación se convierte en factura — y por
          lo tanto dónde se proyecta en el flujo de caja mientras la factura no
          exista.
        </p>
      </div>

      <div className="space-y-2">
        <button
          type="button"
          onClick={() => onChange({ ...value, facturaTiming: "AL_EMITIR" })}
          aria-pressed={!isEspecifico}
          className={cn(CARD, !isEspecifico ? CARD_ON : CARD_OFF)}
        >
          <span className="block text-[13px] font-medium text-ds-text-1">
            El mismo día de la programación
          </span>
          <span className="block text-[12px] text-ds-text-3 mt-0.5">
            Emito la factura al tiro cuando se genera el borrador. El flujo la
            muestra el {progDayOfMonth === -1 ? "último día" : `día ${progDay}`}{" "}
            de cada mes.
          </span>
        </button>

        {supportsTiming ? (
          <button
            type="button"
            onClick={() => onChange({ ...value, facturaTiming: "DIA_ESPECIFICO" })}
            aria-pressed={isEspecifico}
            className={cn(CARD, isEspecifico ? CARD_ON : CARD_OFF)}
          >
            <span className="block text-[13px] font-medium text-ds-text-1">
              Un día específico, después de la programación
            </span>
            <span className="block text-[12px] text-ds-text-3 mt-0.5">
              Primero sale la proforma / estado de pago, espero el OK del cliente
              y la factura sale otro día.
            </span>
          </button>
        ) : (
          <p className="text-[12px] text-status-info-fg/80 px-1">
            Emitir la factura otro día está disponible para frecuencia mensual o
            anual.
          </p>
        )}
      </div>

      {supportsTiming && isEspecifico && (
        <FacturaTimingFields value={value} onChange={onChange} />
      )}

      {preview.length > 0 && (
        <div className="rounded-md border border-border bg-background/60 p-2.5 space-y-1">
          <p className="text-[12px] font-medium text-ds-text-2">Próximos 3 ciclos</p>
          {preview.map((p, i) => (
            <p key={i} className="text-[12px] text-ds-text-3 tabular-nums">
              Programación {format(p.prog, "d MMM", { locale: es })} → factura{" "}
              <span className="text-ds-text-1 font-medium">
                {format(p.factura, "d MMM", { locale: es })}
              </span>
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
