"use client";

import { confirmDialog } from "@/components/ui/confirm-service";
import type { EmitResult } from "./emit-toast";

/**
 * Emite un borrador manejando guards de fecha (409 FUTURE_ISSUE_DATE /
 * ANCHORED_ISSUE_DATE). Si el servidor bloquea, pregunta al usuario con
 * el diálogo del DS (no `window.confirm`):
 *   - Primary → emitir con fecha de hoy
 *   - Secondary → mantener la fecha (confirmación explícita)
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

export type IssueDateGuardConflict = {
  code: "FUTURE_ISSUE_DATE" | "ANCHORED_ISSUE_DATE";
  issueDate: string;
  weekLabel?: string;
  reason?: "sealed" | "past";
};

/** Extra body flags según la elección del usuario en el diálogo. */
export function issueDateGuardPayload(
  conflict: IssueDateGuardConflict,
  useToday: boolean,
): Record<string, unknown> {
  if (useToday) return { forceIssueDateToToday: true };
  return conflict.code === "ANCHORED_ISSUE_DATE"
    ? { allowAnchoredDate: true }
    : { allowFutureDate: true };
}

/**
 * Diálogo DS: fecha futura o anclada en semana sellada/pasada del flujo.
 * `true` = emitir con hoy; `false` = mantener la fecha del documento.
 */
export async function askIssueDateGuard(
  conflict: IssueDateGuardConflict,
): Promise<boolean> {
  const weekBit =
    conflict.code === "ANCHORED_ISSUE_DATE" && conflict.weekLabel
      ? ` quedará anclada en ${conflict.weekLabel} (${
          conflict.reason === "sealed" ? "sellada" : "pasada"
        })`
      : " (posterior a hoy)";

  return confirmDialog({
    title: "Fecha de emisión",
    description:
      `La fecha de emisión es ${conflict.issueDate}${weekBit}.\n\n` +
      `Lo recomendado es emitir con la fecha de hoy. ` +
      `Si mantenés ${conflict.issueDate}, el documento queda con esa fecha tributaria ` +
      `y se ancla en el flujo de caja.`,
    confirmLabel: "Emitir con fecha de hoy",
    cancelLabel: `Mantener ${conflict.issueDate}`,
    variant: "default",
  });
}

function asDateGuardConflict(json: IssueJson): IssueDateGuardConflict | null {
  if (
    (json.code === "FUTURE_ISSUE_DATE" || json.code === "ANCHORED_ISSUE_DATE") &&
    json.issueDate
  ) {
    return {
      code: json.code,
      issueDate: json.issueDate,
      weekLabel: json.weekLabel,
      reason: json.reason,
    };
  }
  return null;
}

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

  const conflict = asDateGuardConflict(first.json);
  if (conflict) {
    const useToday = await askIssueDateGuard(conflict);
    const second = await post(issueDateGuardPayload(conflict, useToday));
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
