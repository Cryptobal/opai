import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, resolveApiPerms, unauthorized } from "@/lib/api-auth";
import { hasCapability } from "@/lib/permissions";
import { canUseAiHelpChat, getAiHelpChatConfig } from "@/lib/ai/help-chat-config";
import { executeToolCallV2, WRITE_TOOL_LABELS } from "@/lib/ai/help-chat-tools-v2";
import { logAudit } from "@/lib/audit";

type Params = { id: string };

type PendingRow = {
  id: string;
  tenantId: string;
  userId: string;
  toolName: string;
  toolArgs: unknown;
  summary: string;
  status: string;
  expiresAt: Date;
};

async function loadPending(id: string, tenantId: string, userId: string): Promise<PendingRow | null> {
  const db = prisma as unknown as Record<string, unknown>;
  if (!db.aiPendingAction) return null;
  return prisma.aiPendingAction.findFirst({
    where: { id, tenantId, userId },
    select: {
      id: true,
      tenantId: true,
      userId: true,
      toolName: true,
      toolArgs: true,
      summary: true,
      status: true,
      expiresAt: true,
    },
  });
}

async function claimPending(id: string, status: "CONFIRMED" | "CANCELLED"): Promise<boolean> {
  const res = await prisma.aiPendingAction.updateMany({
    where: { id, status: "PENDING", expiresAt: { gt: new Date() } },
    data: { status, resolvedAt: new Date() },
  });
  return res.count === 1;
}

async function restorePending(id: string): Promise<void> {
  await prisma.aiPendingAction.updateMany({
    where: { id, status: { in: ["CONFIRMED", "CANCELLED"] } },
    data: { status: "PENDING", resolvedAt: null },
  });
}

/** POST { action: "confirm" | "cancel" } */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<Params> },
) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();

    const cfg = await getAiHelpChatConfig(ctx.tenantId);
    if (!canUseAiHelpChat(ctx.userRole, cfg) || !cfg.allowWrites) {
      return NextResponse.json({ success: false, error: "No tienes acceso a confirmar acciones" }, { status: 403 });
    }

    const { id } = await params;
    const body = (await request.json().catch(() => ({}))) as { action?: string };
    const action = body.action === "cancel" ? "cancel" : body.action === "confirm" ? "confirm" : null;
    if (!action) {
      return NextResponse.json({ success: false, error: "action debe ser confirm o cancel" }, { status: 400 });
    }

    const pending = await loadPending(id, ctx.tenantId, ctx.userId);
    if (!pending) {
      return NextResponse.json({ success: false, error: "Acción no encontrada" }, { status: 404 });
    }

    if (pending.status !== "PENDING" || pending.expiresAt.getTime() <= Date.now()) {
      if (pending.status === "PENDING") {
        await prisma.aiPendingAction.update({
          where: { id: pending.id },
          data: { status: "EXPIRED", resolvedAt: new Date() },
        });
      }
      return NextResponse.json({ success: false, error: "Esta acción ya expiró o fue resuelta" }, { status: 409 });
    }

    const label = WRITE_TOOL_LABELS[pending.toolName] ?? pending.toolName;

    if (action === "cancel") {
      if (!(await claimPending(pending.id, "CANCELLED"))) {
        return NextResponse.json({ success: false, error: "Esta acción ya expiró o fue resuelta" }, { status: 409 });
      }
      await logAudit({
        action: "UPDATE",
        entity: "AiPendingAction",
        entityId: pending.id,
        tenantId: ctx.tenantId,
        userId: ctx.userId,
        details: { toolName: pending.toolName, kind: "TOOL_CONFIRM", via: "web", result: "cancelled" },
      });
      return NextResponse.json({ success: true, data: { status: "CANCELLED", label } });
    }

    if (!(await claimPending(pending.id, "CONFIRMED"))) {
      return NextResponse.json({ success: false, error: "Esta acción ya expiró o fue resuelta" }, { status: 409 });
    }

    const perms = await resolveApiPerms(ctx);
    const args = (pending.toolArgs ?? {}) as Record<string, unknown>;
    let result: { ok?: boolean; error?: string };
    try {
      result = (await executeToolCallV2(
        pending.toolName,
        args,
        ctx.tenantId,
        ctx.userId,
        perms,
        hasCapability(perms, "rendicion_view_all"),
        null,
      )) as { ok?: boolean; error?: string };
    } catch (err) {
      console.error(`[ai-pending] confirm ${pending.toolName}:`, err);
      result = { ok: false, error: "error inesperado" };
    }

    if (!result?.ok) {
      await restorePending(pending.id);
      return NextResponse.json(
        { success: false, error: result?.error ?? `No se pudo completar: ${label}` },
        { status: 422 },
      );
    }

    await logAudit({
      action: "CREATE",
      entity: "AiPendingAction",
      entityId: pending.id,
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      details: { toolName: pending.toolName, kind: "TOOL_CONFIRM", via: "web", result: "confirmed" },
    });

    return NextResponse.json({
      success: true,
      data: { status: "CONFIRMED", label, summary: pending.summary },
    });
  } catch (error) {
    console.error("Error resolving AI pending action:", error);
    return NextResponse.json({ success: false, error: "No se pudo resolver la acción" }, { status: 500 });
  }
}
