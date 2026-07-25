/**
 * Semántica de color de los KPIs del "Pulso del negocio".
 *
 * REGLA DURA (DS v3): el color (`variant`) comunica el DATO, nunca decora.
 * El tinte de dominio (`tone`) agrupa; la variante semántica informa estado.
 * Estas funciones son puras y testeables — el componente `HubPulsoNegocio`
 * solo las consume, para que la regla viva en un único lugar y no se
 * contradiga con el número mostrado (bug histórico: caja negativa en verde).
 *
 * Ver brief "Hub con profundidad visual" §5 (comportamiento esperado).
 */

import type { KPIVariant } from '@/components/opai-ds';
import type { Threshold } from '@/components/opai-ds/tokens';

export type PulsoVariant = KPIVariant; // "default" | "ok" | "warn" | "danger" | "brand"

/**
 * Caja: el SIGNO del saldo manda.
 *   - negativo → alerta (danger), aunque el dato esté fresco.
 *   - cero     → estado vacío neutro (default), nunca verde.
 *   - positivo → correcto (ok).
 * La antigüedad del dato NO decide el color; se comunica como aviso
 * independiente (ver `cajaIsStale`).
 */
export function cajaVariant(totalClp: number): PulsoVariant {
  if (totalClp < 0) return 'danger';
  if (totalClp === 0) return 'default';
  return 'ok';
}

/** Umbral de obsolescencia del saldo de caja (aviso, no color del valor). */
export const CAJA_STALE_DAYS = 7;

/** ¿El saldo de caja está obsoleto? Aviso separado del signo/valor. */
export function cajaIsStale(staleDays: number): boolean {
  return staleDays > CAJA_STALE_DAYS;
}

/**
 * Por cobrar: el monto total SIEMPRE va en tono neutro. El subconjunto
 * vencido se destaca aparte (chip). La tarjeta completa solo escala a
 * alerta si el vencido supera el umbral de negocio.
 *
 * Hoy el negocio no define un umbral monetario, así que el valor total
 * se mantiene neutro y el vencido se comunica con su propio chip. Si en
 * el futuro se define un umbral, basta pasarlo aquí.
 */
export function porCobrarVariant(
  vencidoAmount: number,
  alertThreshold?: number,
): PulsoVariant {
  if (alertThreshold != null && vencidoAmount > alertThreshold) return 'danger';
  return 'default';
}

/**
 * UF negociando: 0 (o sin dato) → estado vacío neutro; >0 → brand.
 * Nunca pintar un cero como resultado positivo.
 */
export function ufNegociandoVariant(uf: number): PulsoVariant {
  return uf > 0 ? 'brand' : 'default';
}

/** Facturado del mes: estado correcto (dato presente ⇒ ok). */
export function facturadoVariant(): PulsoVariant {
  return 'ok';
}

/**
 * Cobertura hoy: conserva los umbrales existentes.
 *   ≥95 correcto · ≥80 advertencia · <80 alerta.
 */
export function coberturaVariant(pct: number): PulsoVariant {
  if (pct >= 95) return 'ok';
  if (pct >= 80) return 'warn';
  return 'danger';
}

/** Mismos cortes que `coberturaVariant`, tipados para la micro-viz `MetricBar`. */
export function coberturaThreshold(pct: number): Threshold {
  if (pct >= 95) return 'ok';
  if (pct >= 80) return 'warn';
  return 'danger';
}
