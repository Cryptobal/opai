/** POST /api/crm/correos/[threadId]/create-structure — crea CRM desde propuesta confirmada. */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized, resolveApiPerms, ensureCanCreateQuote } from "@/lib/api-auth";
import { hasCapability, canView } from "@/lib/permissions";
import { requireCorreosAccess } from "@/lib/api-auth-productividad";
import { requireCrmEdit } from "@/lib/api-auth-crm";
import { createCrmStructureFromProposal } from "@/modules/crm/email/email-to-crm-structure-create.service";
import { coerceCrmStructureProposal } from "@/modules/crm/email/email-to-crm-structure.service";
import type {
  CreateCrmStructureInclude,
  CrmStructureProposal,
  PlanAttachmentSelection,
  PlanMilestone,
  PlanQuoteInput,
  PlanTaskOverride,
} from "@/modules/crm/email/email-to-crm-structure.types";
import { gmailClientForAccount } from "@/modules/crm/email/gmail-account-client";
import { prepareThreadAttachments } from "@/modules/crm/email/email-to-lead-attachments";
import { auditEmailAction } from "@/lib/audit-email";
import type { StagedFile } from "@/modules/crm/email/email-to-lead.types";

type Ctx = { params: Promise<{ threadId: string }> };

export async function POST(req: NextRequest, ctx: Ctx) {
  const mod = await requireCorreosAccess("edit");
  if (!mod.authorized) return mod.response;

  const authCtx = await requireAuth();
  if (!authCtx) return unauthorized();
  const forbidden = await requireCrmEdit(authCtx);
  if (forbidden) return forbidden;

  const perms = await resolveApiPerms(authCtx);
  if (!hasCapability(perms, "radar_comercial")) {
    return NextResponse.json({ error: "Sin permiso de Radar Comercial" }, { status: 403 });
  }

  const account = await prisma.crmEmailAccount.findFirst({
    where: {
      tenantId: authCtx.tenantId,
      userId: authCtx.userId,
      provider: "gmail",
      status: "active",
    },
    select: { id: true, accessTokenEncrypted: true, refreshTokenEncrypted: true },
  });
  if (!account) return NextResponse.json({ error: "Gmail no conectado" }, { status: 400 });

  const body = (await req.json().catch(() => ({}))) as {
    proposal?: CrmStructureProposal;
    include?: CreateCrmStructureInclude;
    refineAnswers?: Array<{ question: string; answer: string }>;
    taskOverride?: PlanTaskOverride;
    attachmentSelection?: PlanAttachmentSelection;
    quoteInput?: PlanQuoteInput;
    milestones?: PlanMilestone[];
  };
  if (!body.proposal) {
    return NextResponse.json({ error: "Falta la propuesta" }, { status: 400 });
  }

  const { threadId } = await ctx.params;
  const proposal = coerceCrmStructureProposal(body.proposal);

  let stagedFiles: StagedFile[] = [];
  try {
    const thread = await prisma.crmEmailThread.findFirst({
      where: { id: threadId, tenantId: authCtx.tenantId, emailAccountId: account.id },
      select: { providerThreadId: true },
    });
    const gmail = gmailClientForAccount(account);
    if (thread?.providerThreadId && gmail) {
      const prepared = await prepareThreadAttachments(
        gmail,
        thread.providerThreadId,
        authCtx.tenantId,
      );
      stagedFiles = prepared.stagedFiles;
    }
  } catch (err) {
    console.error("[create-structure] adjuntos:", err);
  }

  const refineAnswers = Array.isArray(body.refineAnswers)
    ? body.refineAnswers
        .filter(
          (a) =>
            typeof a?.question === "string" &&
            typeof a?.answer === "string" &&
            a.question.trim() &&
            a.answer.trim(),
        )
        .slice(0, 10)
        .map((a) => ({
          question: a.question.trim().slice(0, 300),
          answer: a.answer.trim().slice(0, 500),
        }))
    : undefined;

  const quoteForbidden = await ensureCanCreateQuote(authCtx);
  const canCreateQuote = quoteForbidden == null;
  const canCreateMilestones = canView(perms, "productividad", "agenda");

  const result = await createCrmStructureFromProposal({
    tenantId: authCtx.tenantId,
    userId: authCtx.userId,
    emailAccountId: account.id,
    threadId,
    proposal,
    stagedFiles,
    include: body.include ?? {
      contact: true,
      deal: true,
      installations: true,
      attachments: true,
      followUpTask: false,
    },
    refineAnswers,
    taskOverride: body.taskOverride,
    attachmentSelection: body.attachmentSelection,
    quoteInput: body.quoteInput,
    milestones: body.milestones,
    canCreateQuote,
    canCreateMilestones,
  });

  if (result.ok) {
    void auditEmailAction({
      tenantId: authCtx.tenantId,
      userId: authCtx.userId,
      userEmail: authCtx.userEmail,
      action: "create_structure",
      entityType: "crm_deal",
      entityId: result.dealId ?? result.accountId ?? null,
      meta: {
        threadId,
        accountId: result.accountId,
        dealId: result.dealId,
        taskId: result.taskId,
        quoteId: result.quoteId,
        skipped: result.skipped,
        include: body.include ?? null,
        feature: "correo-create-structure",
      },
    });
  }

  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}
