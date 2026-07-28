import { prisma } from "@/lib/prisma";
import type { AiPlanDraft } from "./email-to-crm-structure.types";

const MAX_DRAFT_BYTES = 256 * 1024;

export async function getPlanDraft(params: {
  tenantId: string;
  threadId: string;
  emailAccountId?: string;
}): Promise<AiPlanDraft | null> {
  const thread = await prisma.crmEmailThread.findFirst({
    where: {
      id: params.threadId,
      tenantId: params.tenantId,
      ...(params.emailAccountId ? { emailAccountId: params.emailAccountId } : {}),
    },
    select: { aiPlanDraft: true },
  });
  if (!thread?.aiPlanDraft || typeof thread.aiPlanDraft !== "object") return null;
  return thread.aiPlanDraft as AiPlanDraft;
}

export async function savePlanDraft(params: {
  tenantId: string;
  threadId: string;
  emailAccountId: string;
  draft: Omit<AiPlanDraft, "savedAt"> & { savedAt?: string };
}): Promise<{ ok: true; savedAt: string } | { ok: false; error: string }> {
  const savedAt = params.draft.savedAt ?? new Date().toISOString();
  const payload: AiPlanDraft = { ...params.draft, savedAt };
  const json = JSON.stringify(payload);
  if (Buffer.byteLength(json, "utf8") > MAX_DRAFT_BYTES) {
    return { ok: false, error: "El borrador supera 256 KB" };
  }

  const updated = await prisma.crmEmailThread.updateMany({
    where: {
      id: params.threadId,
      tenantId: params.tenantId,
      emailAccountId: params.emailAccountId,
    },
    data: { aiPlanDraft: payload },
  });
  if (updated.count === 0) return { ok: false, error: "Hilo no encontrado" };
  return { ok: true, savedAt };
}

export async function clearPlanDraft(params: {
  tenantId: string;
  threadId: string;
  emailAccountId?: string;
}): Promise<void> {
  await prisma.crmEmailThread.updateMany({
    where: {
      id: params.threadId,
      tenantId: params.tenantId,
      ...(params.emailAccountId ? { emailAccountId: params.emailAccountId } : {}),
    },
    data: { aiPlanDraft: null },
  });
}
