/**
 * POST /api/crm/correos/[threadId]/meeting-suggest (Bloque 7): la IA propone
 * una reunión a partir del hilo — {title, startAt, durationMin, attendeeEmails}.
 * Los asistentes se extraen de forma determinista del hilo (no los inventa la
 * IA); el título lo propone la IA. Esto NO crea el evento: la UI confirma y crea
 * vía POST /api/calendar/events. Contenido del correo saneado (untrusted).
 */
import { NextRequest, NextResponse } from "next/server";
import { fromZonedTime, toZonedTime } from "date-fns-tz";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireCorreosAccess } from "@/lib/api-auth-productividad";
import { aiService } from "@/lib/ai-service";
import { logAiUsage } from "@/lib/platform-ai-service";
import { normalizeEmailAddress } from "@/lib/email-address";
import { CHILE_TZ } from "@/lib/dates-cl";
import { UNTRUSTED_RULES, wrapUntrusted } from "@/modules/crm/email/ai-untrusted";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/** Próximo día hábil a las 10:00 hora Chile (default editable de la propuesta). */
function nextBusinessSlot(): Date {
  const cl = toZonedTime(new Date(), CHILE_TZ);
  cl.setDate(cl.getDate() + 1);
  while (cl.getDay() === 0 || cl.getDay() === 6) cl.setDate(cl.getDate() + 1);
  cl.setHours(10, 0, 0, 0);
  return fromZonedTime(cl, CHILE_TZ);
}

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

  const messages = await prisma.crmEmailMessage.findMany({
    where: { threadId, tenantId, isDraft: false },
    orderBy: { sentAt: "desc" },
    take: 6,
    select: { fromEmail: true, toEmails: true, textBody: true, htmlBody: true },
  });

  // Asistentes: emails distintos del hilo, sin la casilla del usuario.
  const own = session.user.email ? normalizeEmailAddress(session.user.email) : "";
  const attendees = new Set<string>();
  for (const m of messages) {
    if (m.fromEmail) attendees.add(normalizeEmailAddress(m.fromEmail));
    for (const e of m.toEmails) attendees.add(normalizeEmailAddress(e));
  }
  attendees.delete(own);
  const attendeeEmails = Array.from(attendees).filter((e) => e.includes("@")).slice(0, 12);

  const body = messages
    .slice(0, 3)
    .map((m) => `${m.fromEmail}: ${(m.textBody || m.htmlBody?.replace(/<[^>]+>/g, " ") || "").replace(/\s+/g, " ").trim().slice(0, 800)}`)
    .join("\n---\n");

  const prompt = `Propón el TÍTULO breve (máx 90 caracteres) de una reunión que resuelva lo que plantea este correo. Responde SOLO JSON: {"title":"..."}.
${UNTRUSTED_RULES}
${wrapUntrusted(`Asunto: ${thread.subject}\n${body}`)}`;

  const startedAt = Date.now();
  let raw: Record<string, unknown> = {};
  try {
    raw = (await aiService.generateJSON(prompt, 200, { tenantId, feature: "correo-meeting-suggest" })) as Record<string, unknown>;
  } catch {
    // Degradación: sin IA igualmente proponemos un default editable.
    raw = {};
  }
  const active = await aiService.getActiveConfig?.({ tenantId, feature: "correo-meeting-suggest" });
  logAiUsage({
    tenantId,
    providerType: active?.providerType ?? "openai",
    model: active?.modelId ?? "json-default",
    feature: "correo-meeting-suggest",
    inputTokens: Math.ceil(prompt.length / 4),
    outputTokens: Math.ceil(JSON.stringify(raw ?? {}).length / 4),
    durationMs: Date.now() - startedAt,
    metadata: { threadId, estimated: true },
  });

  const title = typeof raw.title === "string" && raw.title.trim() ? raw.title.trim().slice(0, 90) : `Reunión: ${thread.subject}`;

  return NextResponse.json({
    title,
    startAt: nextBusinessSlot().toISOString(),
    durationMin: 30,
    attendeeEmails,
  });
}
