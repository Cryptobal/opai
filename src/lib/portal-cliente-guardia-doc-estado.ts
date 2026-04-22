/**
 * Helpers para el portal cliente que computan el estado vigente de los
 * documentos de un guardia y de sus campos OS-10 / contrato (PR7).
 *
 * Devuelve shapes serializables y cliente-friendly — sin exponer PII.
 */

export type DocEstado = "vigente" | "por_vencer" | "vencido" | "pendiente" | "no_aplica";

const MS_PER_DAY = 1000 * 60 * 60 * 24;

/**
 * Calcula el estado de un documento en función de su `status` crudo y su
 * fecha de vencimiento. `alertDays` controla cuántos días antes del
 * vencimiento marcamos "por vencer" (default: 30).
 */
export function computeDocEstado(opts: {
  status: string | null | undefined;
  expiresAt: Date | null | undefined;
  alertDays?: number;
  now?: Date;
}): DocEstado {
  const { status, expiresAt, alertDays = 30, now = new Date() } = opts;

  if (status === "rejected") return "vencido";
  if (!status || status === "pending") return "pendiente";

  if (!expiresAt) {
    // Validado/aprobado sin vencimiento → no aplica revisar caducidad.
    return status === "validated" || status === "approved" ? "no_aplica" : "pendiente";
  }

  const diff = expiresAt.getTime() - now.getTime();
  const days = Math.floor(diff / MS_PER_DAY);

  if (days < 0) return "vencido";
  if (days <= alertDays) return "por_vencer";
  return "vigente";
}

/** Etiqueta legible para el estado de OS-10 del guardia. */
export function computeOs10Estado(opts: {
  os10: boolean | null | undefined;
  os10ExpiresAt: Date | null | undefined;
  now?: Date;
}): DocEstado {
  if (opts.os10 === false) return "vencido";
  if (!opts.os10) return "pendiente";
  return computeDocEstado({ status: "validated", expiresAt: opts.os10ExpiresAt, now: opts.now });
}
