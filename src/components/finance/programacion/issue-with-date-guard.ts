import type { EmitResult } from "./emit-toast";

/**
 * Emite un borrador manejando guards de fecha (409 FUTURE_ISSUE_DATE /
 * ANCHORED_ISSUE_DATE). Si el servidor bloquea, pregunta al usuario:
 *   - OK / default → emitir con fecha de hoy
 *   - Cancel → mantener la fecha (confirmación explícita)
 */
export type IssueDateGuardResult =
  | { ok: true; data: EmitResult | undefined }
  | { ok: false; error: string; cancelled?: boolean; code?: string; options?: unknown };

type IssueJson = {
  success?: boolean;
  error?: string;
  code?: string;
  issueDate?: string;
  todayYmd?: string;
  weekLabel?: string;
  reason?: "sealed" | "past";
  options?: unknown;
  data?: unknown;
};

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
    const json = (await res.json()) as IssueJson;
    return { res, json };
  };

  const first = await post({});
  if (first.json.success) {
    return { ok: true, data: first.json.data as EmitResult | undefined };
  }

  if (
    (first.json.code === "FUTURE_ISSUE_DATE" || first.json.code === "ANCHORED_ISSUE_DATE") &&
    first.json.issueDate
  ) {
    const issueDate = first.json.issueDate;
    const weekBit =
      first.json.code === "ANCHORED_ISSUE_DATE" && first.json.weekLabel
        ? ` quedará anclada en ${first.json.weekLabel} (${
            first.json.reason === "sealed" ? "sellada" : "pasada"
          })`
        : " (posterior a hoy)";
    const useToday = window.confirm(
      `La fecha de emisión es ${issueDate}${weekBit}.\n\n` +
        `Aceptar = emitir con fecha de hoy.\n` +
        `Cancelar = mantener ${issueDate}.`,
    );
    const second = await post(
      useToday
        ? { forceIssueDateToToday: true }
        : first.json.code === "ANCHORED_ISSUE_DATE"
          ? { allowAnchoredDate: true }
          : { allowFutureDate: true },
    );
    if (second.json.success) {
      return { ok: true, data: second.json.data as EmitResult | undefined };
    }
    return {
      ok: false,
      error: second.json.error ?? "Error emitiendo",
      code: second.json.code,
      options: second.json.options,
    };
  }

  return {
    ok: false,
    error: first.json.error ?? "Error emitiendo",
    code: first.json.code,
    options: first.json.options,
  };
}
