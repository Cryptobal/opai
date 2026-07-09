/**
 * Formato del cuerpo de la notificación "Movimientos bancarios recibidos".
 *
 * Un lote trae N movimientos; en vez de solo el conteo, listamos cada uno
 * (fecha · descripción · monto con signo) más el neto del lote. Compartido por
 * los dos emisores del evento `bank_cartola_received`: el inbound de Web4Leads
 * y el importador de cartola por email.
 */

import { formatCLP } from "@/lib/utils";

export interface BankMovementForSummary {
  /** ISO "YYYY-MM-DD" (se toman los primeros 10 chars; sin `new Date()` para no sufrir el shift de TZ dev/prod). */
  transactionDate: string;
  description: string;
  /** CLP; positivo = abono, negativo = cargo. */
  amount: number;
}

/** Cuántos movimientos se listan antes de colapsar en "…y N más". */
const MAX_LINES = 8;
/** Recorte de la descripción por línea (Slack ya limita el body a ~2900). */
const DESC_MAX = 60;

/** "2026-07-07" → "07/07". Trabaja sobre el string, no sobre un Date, a propósito.
 *  Exportada para reusar en el builder de Block Kit de conciliación (sin duplicar). */
export function shortDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[3]}/${m[2]}` : iso;
}

/** Monto con signo explícito: 800000 → "+$800.000", -434567 → "−$434.567".
 *  Exportada para reusar en el builder de Block Kit de conciliación (sin duplicar). */
export function signedCLP(amount: number): string {
  const abs = formatCLP(Math.abs(amount));
  return amount < 0 ? `−${abs}` : `+${abs}`;
}

/**
 * Arma el cuerpo: línea resumen + neto, seguida de hasta MAX_LINES movimientos.
 * Si no hay movimientos que listar, devuelve solo el resumen.
 */
export function buildBankMovementsBody(opts: {
  summary: string;
  movements: BankMovementForSummary[];
}): string {
  const { summary, movements } = opts;
  if (movements.length === 0) return summary;

  const net = movements.reduce(
    (acc, m) => acc + (Number.isFinite(m.amount) ? m.amount : 0),
    0,
  );

  const shown = movements.slice(0, MAX_LINES);
  const lines = shown.map((m) => {
    const desc = m.description.trim().replace(/\s+/g, " ").slice(0, DESC_MAX);
    return `• ${shortDate(m.transactionDate)}  ${desc}  ${signedCLP(m.amount)}`;
  });
  const extra = movements.length - shown.length;
  if (extra > 0) lines.push(`…y ${extra} más`);

  return `${summary} · Neto ${signedCLP(net)}\n\n${lines.join("\n")}`;
}
