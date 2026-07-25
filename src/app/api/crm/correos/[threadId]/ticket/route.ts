/**
 * POST /api/crm/correos/[threadId]/ticket (Bloque 6): crea un ticket desde el
 * correo (source "email") y lo vincula al hilo (CrmEmailThreadLink ops_ticket,
 * linked_via "email_panel"). Permiso: Productividad (requireCorreosAccess). El
 * vencimiento elegido se aplica a slaDueAt si el tipo no impone SLA propio.
 */
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireCorreosAccess } from "@/lib/api-auth-productividad";
import { createOpsTicket } from "@/lib/tickets-create";

export const dynamic = "force-dynamic";

type Body = {
  title?: string;
  priority?: string;
  assignedTeam?: string | null;
  assignedTo?: string | null;
  dueAt?: string | null;
};

export async function POST(req: NextRequest, ctx: { params: Promise<{ threadId: string }> }) {
  const mod = await requireCorreosAccess();
  if (!mod.authorized) return mod.response;
  const session = await auth();
  if (!session?.user?.tenantId) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const tenantId = session.user.tenantId;
  const userId = session.user.id;
  const { threadId } = await ctx.params;

  const account = await prisma.crmEmailAccount.findFirst({
    where: { tenantId, userId, provider: "gmail", status: "active" },
    select: { id: true },
  });
  if (!account) return NextResponse.json({ error: "Gmail no conectado" }, { status: 400 });
  const thread = await prisma.crmEmailThread.findFirst({
    where: { id: threadId, tenantId, emailAccountId: account.id },
    select: { id: true },
  });
  if (!thread) return NextResponse.json({ error: "Hilo no encontrado" }, { status: 404 });

  const body = (await req.json().catch(() => ({}))) as Body;
  const title = typeof body.title === "string" ? body.title.trim().slice(0, 200) : "";
  if (!title) return NextResponse.json({ error: "El título es requerido" }, { status: 400 });

  const result = await createOpsTicket({
    tenantId,
    actorId: userId,
    reportedBy: userId,
    title,
    priority: body.priority ?? null,
    source: "email",
    assignedTeam: body.assignedTeam ?? null,
    assignedTo: body.assignedTo ?? null,
  });
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: 400 });

  // Vencimiento manual → slaDueAt si el tipo no impuso SLA propio.
  let dueAt: Date | null = null;
  if (typeof body.dueAt === "string" && body.dueAt) {
    const d = new Date(body.dueAt);
    if (!Number.isNaN(d.getTime())) dueAt = d;
  }
  if (dueAt) {
    const current = await prisma.opsTicket.findUnique({
      where: { id: result.id },
      select: { slaDueAt: true },
    });
    if (current && current.slaDueAt === null) {
      await prisma.opsTicket.update({ where: { id: result.id }, data: { slaDueAt: dueAt } });
    }
  }

  // Vínculo bidireccional hilo↔ticket (idempotente).
  await prisma.crmEmailThreadLink.upsert({
    where: {
      threadId_entityType_entityId: { threadId, entityType: "ops_ticket", entityId: result.id },
    },
    create: { tenantId, threadId, entityType: "ops_ticket", entityId: result.id, linkedVia: "email_panel", createdBy: userId },
    update: {},
  });

  return NextResponse.json({
    ok: true,
    ticket: { id: result.id, code: result.code, title: result.title, priority: result.priority, status: result.status },
  });
}
