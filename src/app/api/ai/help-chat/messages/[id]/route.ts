import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { canUseAiHelpChat, getAiHelpChatConfig } from "@/lib/ai/help-chat-config";

type Params = { id: string };

function hasChatPersistence(): boolean {
  const db = prisma as unknown as Record<string, unknown>;
  return Boolean(db.aiChatConversation && db.aiChatMessage);
}

/** PATCH — feedback 👍/👎 u otros campos de metadata del mensaje. */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<Params> },
) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();

    const cfg = await getAiHelpChatConfig(ctx.tenantId);
    if (!canUseAiHelpChat(ctx.userRole, cfg)) {
      return NextResponse.json({ success: false, error: "No tienes acceso al asistente" }, { status: 403 });
    }
    if (!hasChatPersistence()) {
      return NextResponse.json({ success: false, error: "Persistencia no disponible" }, { status: 404 });
    }

    const { id } = await params;
    const body = (await request.json().catch(() => ({}))) as { feedback?: "up" | "down" | null };
    if (body.feedback !== undefined && body.feedback !== null && body.feedback !== "up" && body.feedback !== "down") {
      return NextResponse.json({ success: false, error: "feedback inválido" }, { status: 400 });
    }

    const msg = await prisma.aiChatMessage.findFirst({
      where: { id, tenantId: ctx.tenantId },
      select: {
        id: true,
        metadata: true,
        conversation: { select: { userId: true } },
      },
    });
    if (!msg || msg.conversation.userId !== ctx.userId) {
      return NextResponse.json({ success: false, error: "Mensaje no encontrado" }, { status: 404 });
    }

    const prev =
      msg.metadata && typeof msg.metadata === "object" && !Array.isArray(msg.metadata)
        ? (msg.metadata as Record<string, unknown>)
        : {};
    const nextMeta = { ...prev };
    if (body.feedback === null) delete nextMeta.feedback;
    else if (body.feedback) nextMeta.feedback = body.feedback;

    const updated = await prisma.aiChatMessage.update({
      where: { id },
      data: { metadata: nextMeta as Prisma.InputJsonValue },
      select: { id: true, metadata: true },
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    console.error("Error updating AI chat message:", error);
    return NextResponse.json({ success: false, error: "No se pudo actualizar el mensaje" }, { status: 500 });
  }
}
