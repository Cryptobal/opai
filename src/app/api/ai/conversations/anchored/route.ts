/** GET /api/ai/conversations/anchored?type=crm_deal&id=… */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized, resolveApiPerms } from "@/lib/api-auth";
import { canView } from "@/lib/permissions";

const ANCHOR_TYPES = new Set(["crm_deal", "crm_account"]);

async function assertAnchorAccess(
  tenantId: string,
  perms: Awaited<ReturnType<typeof resolveApiPerms>>,
  type: string,
  id: string,
): Promise<boolean> {
  if (type === "crm_deal") {
    if (!canView(perms, "crm", "deals") && !canView(perms, "crm")) return false;
    const deal = await prisma.crmDeal.findFirst({
      where: { id, tenantId },
      select: { id: true },
    });
    return Boolean(deal);
  }
  if (type === "crm_account") {
    if (!canView(perms, "crm", "accounts") && !canView(perms, "crm")) return false;
    const account = await prisma.crmAccount.findFirst({
      where: { id, tenantId },
      select: { id: true },
    });
    return Boolean(account);
  }
  return false;
}

export async function GET(request: NextRequest) {
  const ctx = await requireAuth();
  if (!ctx) return unauthorized();

  const type = (request.nextUrl.searchParams.get("type") ?? "").trim();
  const id = (request.nextUrl.searchParams.get("id") ?? "").trim();
  if (!type || !id || !ANCHOR_TYPES.has(type)) {
    return NextResponse.json({ error: "type e id requeridos" }, { status: 400 });
  }

  const perms = await resolveApiPerms(ctx);
  const allowed = await assertAnchorAccess(ctx.tenantId, perms, type, id);
  if (!allowed) {
    return NextResponse.json({ error: "Sin acceso a la entidad" }, { status: 403 });
  }

  const conversations = await prisma.aiChatConversation.findMany({
    where: {
      tenantId: ctx.tenantId,
      anchorType: type,
      anchorId: id,
    },
    orderBy: { updatedAt: "desc" },
    take: 50,
    select: {
      id: true,
      title: true,
      userId: true,
      createdAt: true,
      updatedAt: true,
      pinnedAt: true,
      messages: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { content: true, role: true, createdAt: true },
      },
    },
  });

  return NextResponse.json({
    conversations: conversations.map((c) => ({
      id: c.id,
      title: c.title,
      userId: c.userId,
      createdAt: c.createdAt.toISOString(),
      updatedAt: c.updatedAt.toISOString(),
      pinnedAt: c.pinnedAt?.toISOString() ?? null,
      lastMessage: c.messages[0]
        ? {
            role: c.messages[0].role,
            content: c.messages[0].content.slice(0, 240),
            createdAt: c.messages[0].createdAt.toISOString(),
          }
        : null,
    })),
  });
}
