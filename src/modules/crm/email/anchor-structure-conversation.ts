import { prisma } from "@/lib/prisma";
import type { CrmStructureProposal } from "./email-to-crm-structure.types";
import type { CrmStructureRefineAnswer } from "./email-to-crm-structure.types";

/**
 * Persiste la conversación del plan de correo anclada al negocio creado.
 * No otorga acceso: la lectura valida tenant + permiso sobre la entidad.
 */
export async function anchorStructureConversation(params: {
  tenantId: string;
  userId: string;
  dealId: string;
  proposal: CrmStructureProposal;
  answers?: CrmStructureRefineAnswer[];
}): Promise<string | undefined> {
  const { tenantId, userId, dealId, proposal, answers = [] } = params;
  try {
    const title =
      proposal.deal.title?.trim() ||
      `Plan desde correo — ${proposal.account.name ?? "negocio"}`;

    const conversation = await prisma.aiChatConversation.create({
      data: {
        tenantId,
        userId,
        title: title.slice(0, 160),
        anchorType: "crm_deal",
        anchorId: dealId,
      },
      select: { id: true },
    });

    const messages: Array<{
      conversationId: string;
      tenantId: string;
      role: string;
      content: string;
      metadata?: object;
    }> = [
      {
        conversationId: conversation.id,
        tenantId,
        role: "assistant",
        content:
          `Plan de acciones generado desde correo.\n` +
          `Cuenta: ${proposal.account.name ?? "—"}\n` +
          `Negocio: ${proposal.deal.title ?? "—"}\n` +
          `Dotación base: ${proposal.staffingTotals.headcountBase} · HH/sem: ${proposal.staffingTotals.weeklyHH}`,
        metadata: { kind: "correo-structure-plan" },
      },
    ];

    for (const a of answers) {
      messages.push({
        conversationId: conversation.id,
        tenantId,
        role: "user",
        content: a.answer,
        metadata: { kind: "correo-refine", question: a.question },
      });
    }

    if (proposal.assumptions.length) {
      messages.push({
        conversationId: conversation.id,
        tenantId,
        role: "assistant",
        content: "Supuestos aplicados:\n- " + proposal.assumptions.join("\n- "),
        metadata: { kind: "correo-assumptions" },
      });
    }

    await prisma.aiChatMessage.createMany({ data: messages });
    return conversation.id;
  } catch (err) {
    console.error("[email-to-crm-structure] anchor conversation:", err);
    return undefined;
  }
}
