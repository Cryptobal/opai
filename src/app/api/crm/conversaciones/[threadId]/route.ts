/**
 * GET /api/crm/conversaciones/[threadId]?entityType=&entityId=
 *
 * Detalle de un hilo compartido, autorizado por la ENTIDAD. Sirve 100% desde
 * el espejo local. Incluye toEmails/ccEmails/htmlBody para armar respuestas.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, resolveApiPerms } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { canView, canViewInstallations } from "@/lib/permissions";
import { getEntityThreadDetail } from "@/modules/crm/email/entity-thread";
import {
  CONVERSATION_ENTITY_TYPES,
  type ConversationEntityType,
} from "@/modules/crm/email/entity-conversations";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ threadId: string }> };

export async function GET(req: NextRequest, ctx: Ctx) {
  const auth = await requireAuth();
  if (!auth) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const tenantId = auth.tenantId;
  const perms = await resolveApiPerms(auth);

  const { threadId } = await ctx.params;
  const entityType = req.nextUrl.searchParams.get("entityType") as ConversationEntityType | null;
  const entityId = req.nextUrl.searchParams.get("entityId");
  if (
    !entityType ||
    !(CONVERSATION_ENTITY_TYPES as readonly string[]).includes(entityType) ||
    !entityId
  ) {
    return NextResponse.json({ error: "entityType/entityId requeridos" }, { status: 400 });
  }

  const thread = await prisma.crmEmailThread.findFirst({
    where: { id: threadId, tenantId },
    select: {
      id: true,
      subject: true,
      accountId: true,
      dealId: true,
      contactId: true,
      sharedWithAccount: true,
      attachmentsMeta: true,
    },
  });
  if (!thread) return NextResponse.json({ error: "Hilo no encontrado" }, { status: 404 });

  let allowed = false;
  if (entityType === "account") {
    allowed =
      canView(perms, "crm", "accounts") &&
      thread.accountId === entityId &&
      thread.sharedWithAccount;
  } else if (entityType === "deal") {
    allowed =
      canView(perms, "crm", "deals") && thread.dealId === entityId && thread.sharedWithAccount;
  } else if (entityType === "contact") {
    if (canView(perms, "crm", "contacts") && thread.sharedWithAccount) {
      if (thread.contactId === entityId) {
        allowed = true;
      } else {
        const bridge = await prisma.crmEmailThreadContact.findFirst({
          where: { tenantId, threadId, contactId: entityId },
          select: { id: true },
        });
        allowed = Boolean(bridge);
      }
    }
  } else if (entityType === "installation") {
    if (canViewInstallations(perms)) {
      const link = await prisma.crmEmailThreadLink.findFirst({
        where: {
          tenantId,
          threadId,
          entityType: "installation",
          entityId,
          visibleOnEntity: true,
        },
        select: { id: true },
      });
      allowed = Boolean(link);
    }
  } else if (entityType === "quote") {
    if (canView(perms, "crm", "quotes")) {
      const link = await prisma.crmEmailThreadLink.findFirst({
        where: {
          tenantId,
          threadId,
          entityType: "quote",
          entityId,
          visibleOnEntity: true,
        },
        select: { id: true },
      });
      allowed = Boolean(link);
    }
  }

  if (!allowed) {
    return NextResponse.json({ error: "Sin acceso a esta conversación" }, { status: 403 });
  }

  const detail = await getEntityThreadDetail({
    tenantId,
    threadId: thread.id,
    subject: thread.subject,
    attachmentsMeta: thread.attachmentsMeta,
  });
  return NextResponse.json({
    ...detail,
    associations: {
      accountId: thread.accountId,
      dealId: thread.dealId,
      contactId: thread.contactId,
    },
  });
}
