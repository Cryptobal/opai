import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { canUseAiHelpChat, getAiHelpChatConfig } from "@/lib/ai/help-chat-config";
import type { VisualBlock, VisualSuggestionItem } from "@/lib/ai/help-chat-visual-types";

type Params = { id: string };

function hasChatPersistence(): boolean {
  const db = prisma as unknown as Record<string, unknown>;
  return Boolean(db.aiChatConversation && db.aiChatMessage);
}

function parseMessageMeta(metadata: unknown): {
  visuals?: VisualBlock[];
  suggestions?: VisualSuggestionItem[];
  feedback?: "up" | "down";
  pendingConfirmations?: Array<{
    id: string;
    confirmToolName: string;
    summary: string;
    status: string;
    expiresAt: string;
  }>;
} {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return {};
  const m = metadata as Record<string, unknown>;
  return {
    visuals: Array.isArray(m.visuals) ? (m.visuals as VisualBlock[]) : undefined,
    suggestions: Array.isArray(m.suggestions) ? (m.suggestions as VisualSuggestionItem[]) : undefined,
    feedback: m.feedback === "up" || m.feedback === "down" ? m.feedback : undefined,
    pendingConfirmations: Array.isArray(m.pendingConfirmations)
      ? (m.pendingConfirmations as Array<{
          id: string;
          confirmToolName: string;
          summary: string;
          status: string;
          expiresAt: string;
        }>)
      : undefined,
  };
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<Params> },
) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();

    const cfg = await getAiHelpChatConfig(ctx.tenantId);
    if (!canUseAiHelpChat(ctx.userRole, cfg)) {
      return NextResponse.json(
        { success: false, error: "No tienes acceso al asistente" },
        { status: 403 },
      );
    }

    if (!hasChatPersistence()) {
      return NextResponse.json(
        { success: false, error: "Persistencia de conversación no disponible" },
        { status: 404 },
      );
    }

    const { id } = await params;
    const conversation = await prisma.aiChatConversation.findFirst({
      where: {
        id,
        tenantId: ctx.tenantId,
        userId: ctx.userId,
      },
      select: {
        id: true,
        title: true,
        pinnedAt: true,
        createdAt: true,
        updatedAt: true,
        messages: {
          select: {
            id: true,
            role: true,
            content: true,
            metadata: true,
            createdAt: true,
          },
          orderBy: [{ createdAt: "asc" }],
          take: 120,
        },
      },
    });

    if (!conversation) {
      return NextResponse.json(
        { success: false, error: "Conversación no encontrada" },
        { status: 404 },
      );
    }

    const messages = conversation.messages.map((msg) => {
      const meta = parseMessageMeta(msg.metadata);
      return {
        id: msg.id,
        role: msg.role,
        content: msg.content,
        createdAt: msg.createdAt,
        visuals: meta.visuals,
        suggestions: meta.suggestions,
        feedback: meta.feedback,
        pendingConfirmations: meta.pendingConfirmations,
      };
    });

    return NextResponse.json({
      success: true,
      data: {
        id: conversation.id,
        title: conversation.title,
        pinnedAt: conversation.pinnedAt,
        createdAt: conversation.createdAt,
        updatedAt: conversation.updatedAt,
        messages,
      },
    });
  } catch (error) {
    console.error("Error fetching AI chat conversation:", error);
    return NextResponse.json(
      { success: false, error: "No se pudo obtener la conversación" },
      { status: 500 },
    );
  }
}

/** PATCH — renombrar o fijar/desafijar. */
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
    const body = (await request.json().catch(() => ({}))) as {
      title?: string;
      pinned?: boolean;
    };

    const existing = await prisma.aiChatConversation.findFirst({
      where: { id, tenantId: ctx.tenantId, userId: ctx.userId },
      select: { id: true },
    });
    if (!existing) {
      return NextResponse.json({ success: false, error: "Conversación no encontrada" }, { status: 404 });
    }

    const data: { title?: string; pinnedAt?: Date | null } = {};
    if (typeof body.title === "string") {
      const title = body.title.replace(/\s+/g, " ").trim().slice(0, 90);
      if (!title) {
        return NextResponse.json({ success: false, error: "El título no puede estar vacío" }, { status: 400 });
      }
      data.title = title;
    }
    if (typeof body.pinned === "boolean") {
      data.pinnedAt = body.pinned ? new Date() : null;
    }
    if (Object.keys(data).length === 0) {
      return NextResponse.json({ success: false, error: "Nada que actualizar" }, { status: 400 });
    }

    const updated = await prisma.aiChatConversation.update({
      where: { id },
      data,
      select: { id: true, title: true, pinnedAt: true, updatedAt: true },
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    console.error("Error updating AI chat conversation:", error);
    return NextResponse.json({ success: false, error: "No se pudo actualizar la conversación" }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
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
    const existing = await prisma.aiChatConversation.findFirst({
      where: { id, tenantId: ctx.tenantId, userId: ctx.userId },
      select: { id: true },
    });
    if (!existing) {
      return NextResponse.json({ success: false, error: "Conversación no encontrada" }, { status: 404 });
    }

    await prisma.aiChatConversation.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting AI chat conversation:", error);
    return NextResponse.json({ success: false, error: "No se pudo eliminar la conversación" }, { status: 500 });
  }
}
