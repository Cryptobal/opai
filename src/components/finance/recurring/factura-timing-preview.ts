import { addMonths, lastDayOfMonth, setDate } from "date-fns";

export interface FacturaTimingValue {
  facturaTiming: "AL_EMITIR" | "DIA_ESPECIFICO";
  facturaDay: string;
  facturaMesRelativo: "MISMO_MES" | "MES_SIGUIENTE";
}

/** Día del mes con clamp; -1 = último día. Espeja el clamp del motor. */
export function applyDay(base: Date, day: number): Date {
  if (day === -1) return lastDayOfMonth(base);
  const last = lastDayOfMonth(base).getDate();
  return setDate(base, Math.min(Math.max(day, 1), last));
}

/**
 * Próximos 3 ciclos: cuándo corre la programación → cuándo sale la factura.
 * Cálculo local (fechas locales, solo para mostrar); la fecha real la resuelve
 * `calcularFechaEmisionProyectada` en el backend con la misma regla: primero el
 * mes destino, después el clamp del día contra ese mes.
 */
export function buildFacturaTimingPreview(
  value: FacturaTimingValue,
  progDay: number,
  today: Date = new Date(),
): { prog: Date; factura: Date }[] {
  const day = Number.parseInt(value.facturaDay, 10);
  return [0, 1, 2].map((i) => {
    const monthStart = addMonths(new Date(today.getFullYear(), today.getMonth(), 1), i);
    const prog = applyDay(monthStart, progDay);
    if (value.facturaTiming === "AL_EMITIR" || !Number.isFinite(day)) {
      return { prog, factura: prog };
    }
    const target =
      value.facturaMesRelativo === "MES_SIGUIENTE" ? addMonths(monthStart, 1) : monthStart;
    return { prog, factura: applyDay(target, day) };
  });
}
