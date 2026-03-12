import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { hasPermission, PERMISSIONS, type Role } from "@/lib/rbac";
import {
  AI_HELP_CHAT_DEFAULT_ROLES,
  canUseAiHelpChat,
  getAiHelpChatConfig,
  saveAiHelpChatConfig,
} from "@/lib/ai/help-chat-config";
import { isValidRole } from "@/lib/rbac";

export async function GET() {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();

    const config = await getAiHelpChatConfig(ctx.tenantId);
    const canManage = isValidRole(ctx.userRole) && hasPermission(ctx.userRole as Role, PERMISSIONS.MANAGE_SETTINGS);

    return NextResponse.json({
      success: true,
      data: {
        ...config,
        canAccess: canUseAiHelpChat(ctx.userRole, config),
        canManage,
        defaults: {
          allowedRoles: [...AI_HELP_CHAT_DEFAULT_ROLES],
        },
      },
    });
  } catch (error) {
    console.error("Error fetching AI Help Chat config:", error);
    return NextResponse.json(
      { success: false, error: "No se pudo obtener la configuración del asistente" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();

    if (!isValidRole(ctx.userRole) || !hasPermission(ctx.userRole as Role, PERMISSIONS.MANAGE_SETTINGS)) {
      return NextResponse.json(
        { success: false, error: "Sin permisos para cambiar esta configuración" },
        { status: 403 },
      );
    }

    const body = (await request.json().catch(() => ({}))) as {
      enabled?: unknown;
      allowedRoles?: unknown;
      allowDataQuestions?: unknown;
    };

    const updated = await saveAiHelpChatConfig(ctx.tenantId, {
      enabled: typeof body.enabled === "boolean" ? body.enabled : undefined,
      allowedRoles: Array.isArray(body.allowedRoles)
        ? body.allowedRoles.filter((r): r is string => typeof r === "string")
        : undefined,
      allowDataQuestions:
        typeof body.allowDataQuestions === "boolean" ? body.allowDataQuestions : undefined,
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    console.error("Error saving AI Help Chat config:", error);
    return NextResponse.json(
      { success: false, error: "No se pudo guardar la configuración del asistente" },
      { status: 500 },
    );
  }
}
