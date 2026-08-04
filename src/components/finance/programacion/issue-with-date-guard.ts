import type { EmitResult } from "./emit-toast";

/**
 * Emite un borrador manejando el guard de fecha futura (409 FUTURE_ISSUE_DATE).
 * Si el servidor bloquea, pregunta al usuario:
 *   - OK / default → emitir con fecha de hoy
 *   - Cancel → mantener la fecha futura (confirmación explícita)
 */
export type IssueDateGuardResult =
  | { ok: true; data: EmitResult | undefined }
  | { ok: false; error: string; cancelled?: boolean };

export async function issueDraftWithDateGuard(
  draftId: string,
  body: Record<string, unknown> = {},
): Promise<IssueDateGuardResult> {
  const post = async (extra: Record<string, unknown>) => {
    const res = await fetch(`/api/finance/billing/drafts/${draftId}/issue`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...body, ...extra }),
    });
    const json = (await res.json()) as {
      success?: boolean;
      error?: string;
      code?: string;
      issueDate?: string;
      todayYmd?: string;
      data?: unknown;
    };
    return { res, json };
  };

  const first = await post({});
  if (first.json.success) {
    return { ok: true, data: first.json.data as EmitResult | undefined };
  }

  if (first.json.code === "FUTURE_ISSUE_DATE" && first.json.issueDate) {
    const issueDate = first.json.issueDate;
    // Default: emitir con hoy. Cancel = mantener fecha futura.
    const useToday = window.confirm(
      `La fecha de emisión es ${issueDate} (posterior a hoy).\n\n` +
        `Aceptar = emitir con fecha de hoy.\n` +
        `Cancelar = mantener ${issueDate}.`,
    );
    const second = await post(
      useToday
        ? { forceIssueDateToToday: true }
        : { allowFutureDate: true },
    );
    if (second.json.success) {
      return { ok: true, data: second.json.data as EmitResult | undefined };
    }
    return { ok: false, error: second.json.error ?? "Error emitiendo" };
  }

  return { ok: false, error: first.json.error ?? "Error emitiendo" };
}
