/**
 * Lógica compartida para diferir escrituras del asistente a confirmación
 * (Slack + chat web). Mantiene el mismo criterio en ambos transportes.
 */

import {
  PREVIEW_TO_CONFIRM,
  WRITE_TOOL_LABELS,
  WRITE_TOOL_NAMES,
  describeWriteArgs,
} from "@/lib/ai/help-chat-tools-v2";

export interface PendingConfirmation {
  previewToolName?: string;
  confirmToolName: string;
  args: Record<string, unknown>;
  summary: string;
}

/** Tools con confirm interno (paso 1 = propuesta; paso 2 = confirm:true). */
const CONFIRM_FLAG_WRITES = new Set(["create_crm_from_email", "create_lead_from_email"]);

export const MAX_PENDING_WRITES = 8;
export const PENDING_TTL_MS = 15 * 60 * 1000;

export function shouldDeferWrite(
  toolName: string,
  args: Record<string, unknown>,
  allowWrites: boolean,
): boolean {
  if (!allowWrites || !WRITE_TOOL_NAMES.has(toolName)) return false;
  // Paso 1 de flujos con confirm flag: ejecutar para obtener la propuesta.
  if (CONFIRM_FLAG_WRITES.has(toolName) && args.confirm !== true) return false;
  return true;
}

export type DeferDecision =
  | { kind: "defer"; pending: PendingConfirmation; toolResult: Record<string, unknown> }
  | { kind: "limit"; toolResult: Record<string, unknown> }
  | { kind: "execute" };

/**
 * Decide si una tool_call se difiere. Si es `preview_*` ok, también encola
 * la escritura mapeada (sin bloquear el resultado del preview).
 */
export function decideWriteDeferral(input: {
  toolName: string;
  args: Record<string, unknown>;
  allowWrites: boolean;
  pendingCount: number;
  /** Resultado ya ejecutado (para preview_* → encolar confirm). */
  executedResult?: { ok?: boolean } | null;
}): DeferDecision {
  const { toolName, args, allowWrites, pendingCount, executedResult } = input;

  if (shouldDeferWrite(toolName, args, allowWrites)) {
    if (pendingCount >= MAX_PENDING_WRITES) {
      return {
        kind: "limit",
        toolResult: {
          ok: false,
          executed: false,
          status: "limit_reached",
          message:
            "Máximo 8 acciones por turno. Pide al usuario confirmar estas y luego continuar con el resto.",
        },
      };
    }
    return {
      kind: "defer",
      pending: {
        confirmToolName: toolName,
        args,
        summary: describeWriteArgs(toolName, args),
      },
      toolResult: {
        ok: true,
        executed: false,
        status: "pending_confirmation",
        message:
          "Acción PREPARADA pero NO ejecutada; se ejecutará solo cuando el usuario presione Confirmar. Si el usuario pidió VARIAS acciones, puedes preparar las siguientes (máx. 8 por turno). Al final resume en 1-2 frases QUÉ quedará pendiente de confirmar. NO afirmes que algo ya está hecho.",
      },
    };
  }

  const previewMap = PREVIEW_TO_CONFIRM[toolName];
  if (allowWrites && previewMap && executedResult?.ok) {
    if (pendingCount >= MAX_PENDING_WRITES) {
      return {
        kind: "limit",
        toolResult: {
          ok: false,
          executed: false,
          status: "limit_reached",
          message:
            "Máximo 8 acciones por turno. Pide al usuario confirmar estas y luego continuar con el resto.",
        },
      };
    }
    const desc = describeWriteArgs(previewMap.confirmToolName, args);
    const baseLabel = WRITE_TOOL_LABELS[previewMap.confirmToolName] ?? previewMap.confirmToolName;
    return {
      kind: "defer",
      pending: {
        previewToolName: toolName,
        confirmToolName: previewMap.confirmToolName,
        args,
        summary: desc === baseLabel ? previewMap.label : desc,
      },
      toolResult: executedResult as Record<string, unknown>,
    };
  }

  return { kind: "execute" };
}
