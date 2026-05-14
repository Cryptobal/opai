/**
 * Helpers compartidos para tools CPQ del asistente IA.
 */
import type { HelpChatPageContext } from "@/lib/ai/help-chat-page-context";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { RolePermissions } from "@/lib/permissions";
import { canDelete, canEdit, canView } from "@/lib/permissions";
import { formatWeekdaysShort } from "@/lib/cpq/weekdays";
import type { ExpandedShiftSlot } from "@/lib/cpq/coverage-ai-expand";
import { resolveRolId, resolveRolPreferPattern } from "@/lib/cpq/ai-quote-catalog-resolve";

export type HcPageCx = HelpChatPageContext | null | undefined;

export function hcCanWriteQuotes(perms: RolePermissions): boolean {
  return canEdit(perms, "crm", "quotes") || canEdit(perms, "cpq");
}

export function hcCanReadQuotes(perms: RolePermissions): boolean {
  return canView(perms, "cpq") || canView(perms, "crm", "quotes");
}

export function hcCanCpqHardDelete(perms: RolePermissions): boolean {
  return canDelete(perms, "cpq");
}

export async function hcAiLog(opts: {
  tenantId: string;
  userId: string;
  toolName: string;
  args: unknown;
  status: "success" | "denied" | "validation_error" | "internal_error";
  resultEntityId?: string;
  resultEntityType?: string;
  errorMessage?: string;
  startedAt: number;
}) {
  try {
    await prisma.aiActionLog.create({
      data: {
        tenantId: opts.tenantId,
        userId: opts.userId,
        toolName: opts.toolName,
        args: opts.args as Prisma.InputJsonValue,
        status: opts.status,
        resultEntityId: opts.resultEntityId ?? null,
        resultEntityType: opts.resultEntityType ?? null,
        errorMessage: opts.errorMessage ?? null,
        durationMs: Date.now() - opts.startedAt,
      },
    });
  } catch (e) {
    console.warn("[AiActionLog]", e);
  }
}

export async function hcPositionsOrdered(quoteId: string) {
  const rows = await prisma.cpqPosition.findMany({
    where: { quoteId },
    orderBy: { createdAt: "asc" },
    include: { puestoTrabajo: true },
  });
  return rows.map((p, ix) => {
    const nombre = p.customName?.trim() || p.puestoTrabajo?.name || `Puesto ${ix + 1}`;
    return { idx: ix + 1, id: p.id, nombre, coverage: `${formatWeekdaysShort(p.weekdays)} ${p.startTime}-${p.endTime}` };
  });
}

export function hcPickPositionId(
  map: Array<{ id: string; nombre: string; idx: number }>,
  a: Record<string, unknown>,
): string | null {
  const pid = typeof a.positionId === "string" ? a.positionId.trim() : "";
  if (pid) return pid;
  if (typeof a.positionIndex === "number" && Number.isFinite(a.positionIndex)) {
    const ix = Math.trunc(a.positionIndex);
    const hit = map.find((x) => x.idx === ix);
    if (hit) return hit.id;
  }
  const sn = typeof a.positionNameSnippet === "string" ? a.positionNameSnippet.trim().toLowerCase() : "";
  if (!sn) return null;
  const hit = map.find((x) => x.nombre.toLowerCase().includes(sn));
  return hit?.id ?? null;
}

export async function hcSyncIncludesArray(quoteId: string) {
  const texts = await prisma.cpqQuoteIncludesItem.findMany({
    where: { quoteId, showInPdf: true },
    orderBy: { sortOrder: "asc" },
    select: { text: true },
  });
  await prisma.cpqQuote.update({
    where: { id: quoteId },
    data: { includedItems: { set: texts.map((t) => t.text) } },
  });
}

export async function hcRolIdForSlot(
  tenantId: string,
  slot: ExpandedShiftSlot,
  fallbackRolId: string,
  rolNameArg?: string,
) {
  if (slot.rolShiftPattern) {
    const m = await resolveRolPreferPattern(tenantId, slot.rolShiftPattern);
    if (m?.id) return m.id;
  }
  const rn = rolNameArg?.trim();
  if (rn) {
    const byNm = await resolveRolId(tenantId, rn);
    if (byNm) return byNm;
    const sug = await resolveRolPreferPattern(tenantId, rn);
    if (sug?.id) return sug.id;
  }
  return fallbackRolId;
}

export function hcMapQuoteResolveError(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  if (msg.includes("ambig")) return msg;
  if (msg === "QUOTE_REF_MISSING") return "Indica código o UUID de cotización, o abre una cotización en la app.";
  if (msg === "QUOTE_NOT_FOUND") return "No encontré la cotización.";
  return msg;
}
