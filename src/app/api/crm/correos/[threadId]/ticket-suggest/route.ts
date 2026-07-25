/**
 * POST /api/crm/correos/[threadId]/ticket-suggest (Bloque 6): la IA propone un
 * ticket a partir del hilo — {title, priority, assignedTeam, dueAt}. "Verdad
 * verificada": esto NO crea nada; solo propone. La UI confirma y crea el ticket
 * vía POST /api/ops/tickets. Contenido del correo saneado (untrusted).
 */
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireCorreosAccess } from "@/lib/api-auth-productividad";
import { aiService } from "@/lib/ai-service";
import { logAiUsage } from "@/lib/platform-ai-service";
import { UNTRUSTED_RULES, wrapUntrusted } from "@/modules/crm/email/ai-untrusted";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const PRIORITIES = ["p1", "p2", "p3", "p4"];

export async function POST(_req: NextRequest, ctx: { params: Promise<{ threadId: string }> }) {
  const mod = await requireCorreosAccess();
  if (!mod.authorized) return mod.response;
  const session = await auth();
  if (!session?.user?.tenantId) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const tenantId = session.user.tenantId;
  const { threadId } = await ctx.params;

  const account = await prisma.crmEmailAccount.findFirst({
    where: { tenantId, userId: session.user.id, provider: "gmail", status: "active" },
    select: { id: true },
  });
  if (!account) return NextResponse.json({ error: "Gmail no conectado" }, { status: 400 });
  const thread = await prisma.crmEmailThread.findFirst({
    where: { id: threadId, tenantId, emailAccountId: account.id },
    select: { id: true, subject: true },
  });
  if (!thread) return NextResponse.json({ error: "Hilo no encontrado" }, { status: 404 });

  const lastMessages = await prisma.crmEmailMessage.findMany({
    where: { threadId, tenantId, isDraft: false },
    orderBy: { sentAt: "desc" },
    take: 3,
    select: { fromEmail: true, textBody: true, htmlBody: true },
  });
  const body = lastMessages
    .map((m) => `${m.fromEmail}: ${(m.textBody || m.htmlBody?.replace(/<[^>]+>/g, " ") || "").replace(/\s+/g, " ").trim().slice(0, 1200)}`)
    .join("\n---\n");

  const prompt = `Propón un TICKET de seguimiento a partir de este correo. Responde SOLO JSON:
{"title":"asunto breve del ticket (máx 120)","priority":"p1|p2|p3|p4","assignedTeam":"equipo sugerido (texto libre, ej. Operaciones)","dueAtDays":número entero de días hasta el vencimiento (1-14) o null}
priority: p1=crítico, p2=alto, p3=normal, p4=bajo. Usa p3 si no hay urgencia clara.
${UNTRUSTED_RULES}
${wrapUntrusted(`Asunto: ${thread.subject}\n${body}`)}`;

  const startedAt = Date.now();
  let raw: Record<string, unknown> = {};
  try {
    raw = (await aiService.generateJSON(prompt, 400, { tenantId, feature: "correo-ticket-suggest" })) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "La IA no pudo proponer el ticket" }, { status: 502 });
  }
  logAiUsage({
    tenantId,
    providerType: "openai",
    model: "json-default",
    feature: "correo-ticket-suggest",
    inputTokens: Math.ceil(prompt.length / 4),
    outputTokens: Math.ceil(JSON.stringify(raw ?? {}).length / 4),
    durationMs: Date.now() - startedAt,
    metadata: { threadId, estimated: true },
  });

  const title = typeof raw.title === "string" && raw.title.trim() ? raw.title.trim().slice(0, 120) : `Seguimiento: ${thread.subject}`;
  const priority = PRIORITIES.includes(String(raw.priority)) ? String(raw.priority) : "p3";
  const assignedTeam = typeof raw.assignedTeam === "string" ? raw.assignedTeam.trim().slice(0, 60) : "";
  const dueAtDays = typeof raw.dueAtDays === "number" && raw.dueAtDays > 0 && raw.dueAtDays <= 30 ? Math.round(raw.dueAtDays) : null;

  return NextResponse.json({ title, priority, assignedTeam, dueAtDays });
}
