import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized, resolveApiPerms } from "@/lib/api-auth";
import { hasModuleAccess, canView, type ModuleKey } from "@/lib/permissions";
import { UNIFIED_NOTIFICATION_TYPES, type UnifiedNotificationType } from "@/lib/notifications/catalog";
import {
  normalizePrefs,
  type ChannelPrefs,
  type ChannelPrefsLegacy,
} from "@/lib/notifications/channel-types";
import { getWorkspaceForTenant } from "@/lib/integrations/slack/workspace";
import { applySlackTenantEmailDefault } from "@/lib/notifications/doc-expiry-channel-defaults";

type PrefsMap = Record<string, ChannelPrefs>;
type LegacyPrefsMap = Record<string, ChannelPrefsLegacy>;

function isAccessible(
  type: UnifiedNotificationType,
  perms: import("@/lib/permissions").RolePermissions,
): boolean {
  if (type.module === 'chat') return true;
  const moduleKey = type.module as ModuleKey;
  if (type.submodule) return canView(perms, moduleKey, type.submodule);
  return hasModuleAccess(perms, moduleKey);
}

export async function GET() {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await resolveApiPerms(ctx);

    const record = await prisma.notificationPreference.findUnique({
      where: {
        subscriberType_subscriberId: { subscriberType: 'ADMIN', subscriberId: ctx.userId },
      },
    });
    const saved = (record?.preferences as LegacyPrefsMap | null) ?? {};

    const ws = await getWorkspaceForTenant(ctx.tenantId);
    const tenantSlackActive = !!ws;

    const accessible = UNIFIED_NOTIFICATION_TYPES.filter(
      (t) => t.audiences.includes('admin') && isAccessible(t, perms),
    );

    const out: PrefsMap = {};
    for (const t of accessible) {
      const def = applySlackTenantEmailDefault(
        t.key,
        t.defaults.admin ?? {},
        tenantSlackActive,
      );
      const stored = normalizePrefs(saved[t.key]);
      out[t.key] = {
        bell: typeof stored.bell === 'boolean' ? stored.bell : def.bell ?? false,
        email: typeof stored.email === 'boolean' ? stored.email : def.email ?? false,
        pushDesktop:
          typeof stored.pushDesktop === 'boolean' ? stored.pushDesktop : def.push ?? false,
        pushMobile:
          typeof stored.pushMobile === 'boolean' ? stored.pushMobile : def.push ?? false,
        // Slack personal: siempre opt-in (default OFF), sin default de catálogo.
        slack: typeof stored.slack === 'boolean' ? stored.slack : false,
      };
    }

    // Estado del canal Slack personal: workspace activo + vínculo del usuario.
    let slackLinked = false;
    if (ws) {
      const link = await prisma.slackUserLink.findFirst({
        where: { workspaceId: ws.id, adminId: ctx.userId },
        select: { id: true },
      });
      slackLinked = !!link;
    }

    return NextResponse.json({
      success: true,
      data: {
        preferences: out,
        types: accessible,
        slack: { workspaceActive: !!ws, linked: slackLinked },
      },
    });
  } catch (error) {
    console.error("[notif-prefs] GET error:", error);
    return NextResponse.json(
      { success: false, error: "Error al obtener preferencias" },
      { status: 500 },
    );
  }
}

export async function PUT(req: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();

    const body = (await req.json().catch(() => ({}))) as { preferences?: Record<string, ChannelPrefsLegacy> };
    const incoming = body.preferences;
    if (!incoming || typeof incoming !== 'object') {
      return NextResponse.json(
        { success: false, error: "Se requiere 'preferences'" },
        { status: 400 },
      );
    }

    // Sanitize: normalizar a shape nuevo y solo aceptar tipos del catálogo
    const sanitized: PrefsMap = {};
    for (const t of UNIFIED_NOTIFICATION_TYPES) {
      const v = incoming[t.key];
      if (!v) continue;
      const norm = normalizePrefs(v);
      const entry: ChannelPrefs = {};
      if (typeof norm.bell === 'boolean') entry.bell = norm.bell;
      if (typeof norm.email === 'boolean') entry.email = norm.email;
      if (typeof norm.pushDesktop === 'boolean') entry.pushDesktop = norm.pushDesktop;
      if (typeof norm.pushMobile === 'boolean') entry.pushMobile = norm.pushMobile;
      if (typeof norm.slack === 'boolean') entry.slack = norm.slack;
      if (Object.keys(entry).length > 0) sanitized[t.key] = entry;
    }

    await prisma.notificationPreference.upsert({
      where: {
        subscriberType_subscriberId: { subscriberType: 'ADMIN', subscriberId: ctx.userId },
      },
      update: { preferences: sanitized as object },
      create: {
        tenantId: ctx.tenantId,
        subscriberType: 'ADMIN',
        subscriberId: ctx.userId,
        preferences: sanitized as object,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[notif-prefs] PUT error:", error);
    return NextResponse.json(
      { success: false, error: "Error al guardar preferencias" },
      { status: 500 },
    );
  }
}
