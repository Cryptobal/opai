/**
 * POST /api/crm/correos/[threadId]/links/suggest (O04): sugerencia de
 * vínculos por IA con confirmación humana (patrón email→lead). La IA solo
 * puede elegir entre candidatos REALES del tenant (nunca inventa ids):
 * instalaciones de la cuenta asociada, facturas del receptor y tickets de
 * esas instalaciones. El usuario confirma y recién ahí se crea el link
 * (linked_via='ai').
 */
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireCorreosAccess } from "@/lib/api-auth-productividad";
import { aiService } from "@/lib/ai-service";
import { logAiUsage } from "@/lib/platform-ai-service";
import { UNTRUSTED_RULES, wrapUntrusted } from "@/modules/crm/email/ai-untrusted";

export const maxDuration = 30;

type Candidate = { entityType: string; entityId: string; label: string };

export async function POST(
  _req: NextRequest,
  ctx: { params: Promise<{ threadId: string }> },
) {
  const mod = await requireCorreosAccess();
  if (!mod.authorized) return mod.response;
  const session = await auth();
  if (!session?.user?.tenantId) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  const tenantId = session.user.tenantId;
  const { threadId } = await ctx.params;

  const account = await prisma.crmEmailAccount.findFirst({
    where: { tenantId, userId: session.user.id, provider: "gmail", status: "active" },
    select: { id: true },
  });
  if (!account) return NextResponse.json({ error: "Gmail no conectado" }, { status: 400 });
  const thread = await prisma.crmEmailThread.findFirst({
    where: { id: threadId, tenantId, emailAccountId: account.id },
    select: { id: true, subject: true, accountId: true },
  });
  if (!thread) return NextResponse.json({ error: "Hilo no encontrado" }, { status: 404 });
  if (!thread.accountId) {
    return NextResponse.json({
      suggestions: [],
      note: "Asociá primero el hilo a una cuenta para sugerir vínculos operacionales.",
    });
  }

  const crmAccount = await prisma.crmAccount.findFirst({
    where: { tenantId, id: thread.accountId },
    select: { name: true },
  });
  const [installations, dtes] = await Promise.all([
    prisma.crmInstallation.findMany({
      where: { tenantId, accountId: thread.accountId },
      select: { id: true, name: true },
      take: 15,
    }),
    crmAccount
      ? prisma.financeDte.findMany({
          where: {
            tenantId,
            receiverName: { contains: crmAccount.name.slice(0, 24), mode: "insensitive" },
          },
          select: { id: true, folio: true, receiverName: true },
          orderBy: { date: "desc" },
          take: 10,
        })
      : [],
  ]);
  const tickets = installations.length
    ? await prisma.opsTicket.findMany({
        where: {
          tenantId,
          installationId: { in: installations.map((i) => i.id) },
          status: { notIn: ["closed", "resolved"] },
        },
        select: { id: true, code: true, title: true },
        take: 10,
      })
    : [];

  const candidates: Candidate[] = [
    ...installations.map((i) => ({ entityType: "installation", entityId: i.id, label: i.name })),
    ...dtes.map((d) => ({ entityType: "factura", entityId: d.id, label: `Folio ${d.folio} · ${d.receiverName}` })),
    ...tickets.map((t) => ({ entityType: "incidente", entityId: t.id, label: `${t.code} · ${t.title}` })),
  ];
  if (candidates.length === 0) return NextResponse.json({ suggestions: [] });

  const lastMessages = await prisma.crmEmailMessage.findMany({
    where: { threadId, tenantId, isDraft: false },
    orderBy: { sentAt: "desc" },
    take: 3,
    select: { fromEmail: true, textBody: true, htmlBody: true },
  });
  const body = lastMessages
    .map(
      (m) =>
        `${m.fromEmail}: ${(m.textBody || m.htmlBody?.replace(/<[^>]+>/g, " ") || "").replace(/\s+/g, " ").trim().slice(0, 1200)}`,
    )
    .join("\n---\n");

  const prompt = `De la lista de ENTIDADES CANDIDATAS, elige SOLO las que el correo menciona o a las que claramente se refiere (instalación aludida, factura por folio o monto, incidente descrito). Responde SOLO JSON: {"sugerencias":[{"entityType":"...","entityId":"...","motivo":"frase breve"}]} — usa EXACTAMENTE los entityId listados; [] si ninguna aplica.
CANDIDATAS:
${candidates.map((c) => `- ${c.entityType} ${c.entityId}: ${c.label}`).join("\n")}
${UNTRUSTED_RULES}
${wrapUntrusted(`Asunto: ${thread.subject}\n${body}`)}`;

  const startedAt = Date.now();
  let raw: Record<string, unknown> = {};
  try {
    raw = (await aiService.generateJSON(prompt, 500, { tenantId, feature: "correo-link-suggest" })) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "La IA no pudo sugerir vínculos" }, { status: 502 });
  }
  const active = await aiService.getActiveConfig?.({ tenantId, feature: "correo-link-suggest" });
  logAiUsage({
    tenantId,
    providerType: active?.providerType ?? "openai",
    model: active?.modelId ?? "json-default",
    feature: "correo-link-suggest",
    inputTokens: Math.ceil(prompt.length / 4),
    outputTokens: Math.ceil(JSON.stringify(raw ?? {}).length / 4),
    durationMs: Date.now() - startedAt,
    metadata: { threadId, candidates: candidates.length, estimated: true },
  });

  const byKey = new Map(candidates.map((c) => [`${c.entityType}:${c.entityId}`, c]));
  const sugerencias = Array.isArray(raw?.sugerencias) ? raw.sugerencias : [];
  const suggestions = sugerencias.flatMap((s: unknown) => {
    const o = (s ?? {}) as Record<string, unknown>;
    // La IA solo elige entre candidatos reales: ids inventados se descartan.
    const candidate = byKey.get(`${String(o.entityType)}:${String(o.entityId)}`);
    if (!candidate) return [];
    return [
      {
        entityType: candidate.entityType,
        entityId: candidate.entityId,
        label: candidate.label,
        motivo: typeof o.motivo === "string" ? o.motivo.slice(0, 160) : "",
      },
    ];
  });
  return NextResponse.json({ suggestions });
}
