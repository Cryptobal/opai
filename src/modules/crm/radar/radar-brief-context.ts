import { prisma } from "@/lib/prisma";
import { aiService } from "@/lib/ai-service";
import { getDealEmailScope, buildDealThreadWhere } from "@/modules/crm/email/deal-thread-scope";
import { stripHtml, clampText } from "@/modules/crm/email/radar-util";
import type { BriefMatch } from "./radar-brief-match";

export type BriefContext = { brief: string; dealId: string | null; accountName: string };

/** Reúne el contexto de la cuenta y redacta el brief pre-reunión con gpt-4o-mini. */
export async function buildBrief(
  tenantId: string,
  match: BriefMatch,
  hora: string,
): Promise<BriefContext | null> {
  const account = await prisma.crmAccount.findFirst({
    where: { id: match.accountId, tenantId },
    select: { name: true },
  });
  if (!account) return null;

  const [contacts, deals] = await Promise.all([
    match.contactIds.length
      ? prisma.crmContact.findMany({
          where: { tenantId, id: { in: match.contactIds } },
          select: { firstName: true, lastName: true, roleTitle: true },
        })
      : Promise.resolve([]),
    prisma.crmDeal.findMany({
      where: { tenantId, accountId: match.accountId, status: "open" },
      orderBy: { updatedAt: "desc" },
      take: 3,
      select: {
        id: true, title: true, amount: true, activeQuotationId: true,
        stage: { select: { name: true } },
      },
    }),
  ]);
  const deal = deals[0] ?? null;

  const scope = deal ? await getDealEmailScope(tenantId, deal.id) : null;
  const where = deal
    ? buildDealThreadWhere(tenantId, deal.id, scope ?? { accountId: match.accountId, contactIds: [] })
    : { tenantId, accountId: match.accountId };
  const threads = await prisma.crmEmailThread.findMany({
    where, select: { id: true }, orderBy: { lastMessageAt: "desc" }, take: 8,
  });
  const msgs = threads.length
    ? await prisma.crmEmailMessage.findMany({
        where: { tenantId, threadId: { in: threads.map((t) => t.id) } },
        orderBy: { sentAt: "desc" }, take: 3,
        select: { direction: true, subject: true, textBody: true, htmlBody: true },
      })
    : [];

  const [lastVisit, compromisos] = await Promise.all([
    prisma.agendaVisita.findFirst({
      where: { tenantId, accountId: match.accountId },
      orderBy: { startAt: "desc" }, select: { title: true, status: true },
    }),
    prisma.crmRadarItem.findMany({
      where: { tenantId, accountId: match.accountId, kind: "compromiso", status: "PENDING" },
      select: { title: true }, take: 5,
    }),
  ]);

  const lines: string[] = [`Cuenta: ${account.name}`];
  if (contacts.length)
    lines.push(`Asistentes: ${contacts.map((c) => `${c.firstName} ${c.lastName}${c.roleTitle ? ` (${c.roleTitle})` : ""}`).join(", ")}`);
  if (deal)
    lines.push(`Negocio: ${deal.title} · etapa ${deal.stage?.name ?? "—"} · monto ${deal.amount} · ${deal.activeQuotationId ? "con cotización activa" : "sin cotización"}`);
  if (msgs.length)
    lines.push(`Últimos correos:\n${msgs.map((m) => `- [${m.direction === "in" ? "cliente" : "nosotros"}] ${clampText(m.subject, 80)}: ${clampText(m.textBody || stripHtml(m.htmlBody), 180)}`).join("\n")}`);
  if (lastVisit) lines.push(`Última visita: ${lastVisit.title} (${lastVisit.status})`);
  if (compromisos.length) lines.push(`Compromisos pendientes: ${compromisos.map((c) => c.title).join("; ")}`);

  const prompt = `Eres un asistente comercial de una empresa de seguridad privada en Chile. Redacta un BRIEF PRE-REUNIÓN accionable de 6-8 líneas en español chileno neutro para preparar la reunión de las ${hora}. Sé concreto: estado del negocio, qué está pendiente y el próximo paso recomendado (ej: "Van 12 días sin respuesta de la propuesta; el pendiente es X"). No inventes datos. Devuelve SOLO el texto del brief.
Contexto:
${lines.join("\n")}`;

  let brief = "";
  try {
    brief = (await aiService.generateText(prompt, { maxTokens: 400, temperature: 0.4 }, { tenantId }))?.trim() || "";
  } catch {
    brief = "";
  }
  if (!brief) {
    brief = `Reunión con ${account.name}${deal ? ` · ${deal.title}` : ""}. Revisa el negocio y los últimos correos antes de la llamada.`;
  }
  return { brief, dealId: deal?.id ?? null, accountName: account.name };
}
