/** GET/POST /api/ai/conversations/anchored — listar o get-or-create hilos anclados. */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized, resolveApiPerms } from "@/lib/api-auth";
import {
  assertAnchorAccess,
  conversationTitleForAnchor,
  isAnchorType,
  type AnchorType,
} from "@/lib/ai/help-chat-anchor";

function serializeConversation(c: {
  id: string;
  title: string;
  userId: string;
  createdAt: Date;
  updatedAt: Date;
  pinnedAt: Date | null;
  messages: Array<{ content: string; role: string; createdAt: Date }>;
}) {
  return {
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
  };
}

const convSelect = {
  id: true,
  title: true,
  userId: true,
  createdAt: true,
  updatedAt: true,
  pinnedAt: true,
  messages: {
    orderBy: { createdAt: "desc" as const },
    take: 1,
    select: { content: true, role: true, createdAt: true },
  },
};

export async function GET(request: NextRequest) {
  const ctx = await requireAuth();
  if (!ctx) return unauthorized();

  const type = (request.nextUrl.searchParams.get("type") ?? "").trim();
  const id = (request.nextUrl.searchParams.get("id") ?? "").trim();
  if (!type || !id || !isAnchorType(type)) {
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
    select: convSelect,
  });

  return NextResponse.json({ conversations: conversations.map(serializeConversation) });
}

export async function POST(request: NextRequest) {
  const ctx = await requireAuth();
  if (!ctx) return unauthorized();

  const body = (await request.json().catch(() => ({}))) as {
    type?: unknown;
    id?: unknown;
    entityName?: unknown;
    createNew?: unknown;
  };
  const type = typeof body.type === "string" ? body.type.trim() : "";
  const id = typeof body.id === "string" ? body.id.trim() : "";
  const entityName = typeof body.entityName === "string" ? body.entityName.trim() : "Entidad";
  const createNew = body.createNew === true;

  if (!type || !id || !isAnchorType(type)) {
    return NextResponse.json({ error: "type e id requeridos" }, { status: 400 });
  }

  const perms = await resolveApiPerms(ctx);
  const allowed = await assertAnchorAccess(ctx.tenantId, perms, type, id);
  if (!allowed) {
    return NextResponse.json({ error: "Sin acceso a la entidad" }, { status: 403 });
  }

  const title = conversationTitleForAnchor(type as AnchorType, entityName);

  if (!createNew) {
    const existing = await prisma.aiChatConversation.findFirst({
      where: {
        tenantId: ctx.tenantId,
        userId: ctx.userId,
        anchorType: type,
        anchorId: id,
      },
      orderBy: { updatedAt: "desc" },
      select: convSelect,
    });
    if (existing) {
      return NextResponse.json({ conversation: serializeConversation(existing), created: false });
    }
  }

  const created = await prisma.aiChatConversation.create({
    data: {
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      title,
      anchorType: type,
      anchorId: id,
    },
    select: convSelect,
  });

  return NextResponse.json({ conversation: serializeConversation(created), created: true });
}
