/**
 * Links operacionales de un hilo (O01-O04):
 *  GET    → links resueltos (label + estado + deep-link).
 *  POST   → crear { entityType, entityId, linkedVia? } (valida tenant).
 *  DELETE → ?linkId= elimina un vínculo.
 * Auditado vía auditEmailAction; unique (thread, tipo, entidad) = idempotente.
 */
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireCorreosAccess } from "@/lib/api-auth-productividad";
import { auditEmailAction } from "@/lib/audit-email";
import {
  isThreadLinkEntityType,
  resolveThreadLinks,
  threadLinkEntityExists,
} from "@/modules/crm/email/email-thread-links";

async function threadOfUser(tenantId: string, userId: string, threadId: string) {
  const account = await prisma.crmEmailAccount.findFirst({
    where: { tenantId, userId, provider: "gmail", status: "active" },
    select: { id: true },
  });
  if (!account) return null;
  return prisma.crmEmailThread.findFirst({
    where: { id: threadId, tenantId, emailAccountId: account.id },
    select: { id: true },
  });
}

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ threadId: string }> },
) {
  const mod = await requireCorreosAccess();
  if (!mod.authorized) return mod.response;
  const session = await auth();
  if (!session?.user?.tenantId) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  const { threadId } = await ctx.params;
  const thread = await threadOfUser(session.user.tenantId, session.user.id, threadId);
  if (!thread) return NextResponse.json({ error: "Hilo no encontrado" }, { status: 404 });
  const links = await resolveThreadLinks({
    tenantId: session.user.tenantId,
    threadId,
  });
  return NextResponse.json({ links });
}

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ threadId: string }> },
) {
  const mod = await requireCorreosAccess();
  if (!mod.authorized) return mod.response;
  const session = await auth();
  if (!session?.user?.tenantId) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  const { threadId } = await ctx.params;
  const tenantId = session.user.tenantId;
  const thread = await threadOfUser(tenantId, session.user.id, threadId);
  if (!thread) return NextResponse.json({ error: "Hilo no encontrado" }, { status: 404 });

  const body = (await req.json().catch(() => ({}))) as {
    entityType?: string;
    entityId?: string;
    linkedVia?: string;
  };
  if (
    !body.entityType ||
    !isThreadLinkEntityType(body.entityType) ||
    typeof body.entityId !== "string" ||
    !body.entityId
  ) {
    return NextResponse.json({ error: "entityType/entityId inválidos" }, { status: 400 });
  }
  const exists = await threadLinkEntityExists({
    tenantId,
    type: body.entityType,
    entityId: body.entityId,
  });
  if (!exists) {
    return NextResponse.json({ error: "Entidad no encontrada" }, { status: 404 });
  }
  const linkedVia = body.linkedVia === "ai" || body.linkedVia === "rule" ? body.linkedVia : "manual";
  const link = await prisma.crmEmailThreadLink.upsert({
    where: {
      threadId_entityType_entityId: {
        threadId,
        entityType: body.entityType,
        entityId: body.entityId,
      },
    },
    create: {
      tenantId,
      threadId,
      entityType: body.entityType,
      entityId: body.entityId,
      linkedVia,
      createdBy: session.user.id,
    },
    update: {},
  });
  void auditEmailAction({
    tenantId,
    userId: session.user.id,
    userEmail: session.user.email,
    action: "associate",
    entityType: "email_thread",
    entityId: threadId,
    meta: { link: body.entityType, entityId: body.entityId, linkedVia },
  });
  return NextResponse.json({ success: true, linkId: link.id });
}

export async function DELETE(
  req: NextRequest,
  ctx: { params: Promise<{ threadId: string }> },
) {
  const mod = await requireCorreosAccess();
  if (!mod.authorized) return mod.response;
  const session = await auth();
  if (!session?.user?.tenantId) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  const { threadId } = await ctx.params;
  const linkId = req.nextUrl.searchParams.get("linkId");
  if (!linkId) return NextResponse.json({ error: "linkId requerido" }, { status: 400 });
  const thread = await threadOfUser(session.user.tenantId, session.user.id, threadId);
  if (!thread) return NextResponse.json({ error: "Hilo no encontrado" }, { status: 404 });
  const result = await prisma.crmEmailThreadLink.deleteMany({
    where: { id: linkId, tenantId: session.user.tenantId, threadId },
  });
  if (result.count === 0) {
    return NextResponse.json({ error: "Vínculo no encontrado" }, { status: 404 });
  }
  void auditEmailAction({
    tenantId: session.user.tenantId,
    userId: session.user.id,
    userEmail: session.user.email,
    action: "associate",
    entityType: "email_thread",
    entityId: threadId,
    meta: { unlink: linkId },
  });
  return NextResponse.json({ success: true });
}
