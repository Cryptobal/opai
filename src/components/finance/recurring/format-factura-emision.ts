/** Campos mínimos para renderizar la regla de emisión en listas. */
export interface FacturaEmisionRuleInput {
  frequency: string;
  facturaTiming?: "AL_EMITIR" | "DIA_ESPECIFICO" | null;
  facturaDay?: number | null;
  facturaMesRelativo?: "MISMO_MES" | "MES_SIGUIENTE" | null;
}

export interface FacturaEmisionRule {
  /** Texto corto para la celda / tag (ej. "Mismo día", "Día 5 · mes siguiente"). */
  text: string;
  /** true cuando la emisión difiere del día de programación. */
  deferred: boolean;
}

/**
 * Regla legible de cuándo se emite la factura real respecto a la programación.
 * Solo mensual/anual admiten emisión diferida; el resto siempre es mismo día.
 */
export function formatFacturaEmisionRule(
  input: FacturaEmisionRuleInput,
): FacturaEmisionRule {
  const supportsTiming =
    input.frequency === "monthly" || input.frequency === "yearly";

  if (
    !supportsTiming ||
    !input.facturaTiming ||
    input.facturaTiming === "AL_EMITIR"
  ) {
    return { text: "Mismo día", deferred: false };
  }

  const day = input.facturaDay ?? 1;
  const dayLabel = day === -1 ? "Último día" : `Día ${day}`;
  const mesLabel =
    input.facturaMesRelativo === "MES_SIGUIENTE"
      ? "mes siguiente"
      : "mismo mes";

  return { text: `${dayLabel} · ${mesLabel}`, deferred: true };
}
