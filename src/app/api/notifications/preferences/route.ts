import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized, resolveApiPerms } from "@/lib/api-auth";
import { hasModuleAccess, canView, type ModuleKey } from "@/lib/permissions";
import { UNIFIED_NOTIFICATION_TYPES, type UnifiedNotificationType } from "@/lib/notifications/catalog";

interface ChannelPrefs {
  bell?: boolean;
  email?: boolean;
  push?: boolean;
}

type PrefsMap = Record<string, ChannelPrefs>;

function isAccessible(type: UnifiedNotificationType, perms: import("@/lib/permissions").RolePermissions): boolean {
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
    const saved = (record?.preferences as PrefsMap | null) ?? {};

    const accessible = UNIFIED_NOTIFICATION_TYPES.filter(
      (t) => t.audiences.includes('admin') && isAccessible(t, perms),
    );

    const out: PrefsMap = {};
    for (const t of accessible) {
      const def = t.defaults.admin ?? {};
      const stored = saved[t.key] ?? {};
      out[t.key] = {
        bell: typeof stored.bell === 'boolean' ? stored.bell : def.bell ?? false,
        email: typeof stored.email === 'boolean' ? stored.email : def.email ?? false,
        push: typeof stored.push === 'boolean' ? stored.push : def.push ?? false,
      };
    }

    return NextResponse.json({
      success: true,
      data: { preferences: out, types: accessible },
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

    const body = (await req.json().catch(() => ({}))) as { preferences?: PrefsMap };
    const incoming = body.preferences;
    if (!incoming || typeof incoming !== 'object') {
      return NextResponse.json(
        { success: false, error: "Se requiere 'preferences'" },
        { status: 400 },
      );
    }

    // Sanitize: only allow known channel booleans for known catalog keys
    const sanitized: PrefsMap = {};
    for (const t of UNIFIED_NOTIFICATION_TYPES) {
      const v = incoming[t.key];
      if (!v) continue;
      const entry: ChannelPrefs = {};
      if (typeof v.bell === 'boolean') entry.bell = v.bell;
      if (typeof v.email === 'boolean') entry.email = v.email;
      if (typeof v.push === 'boolean') entry.push = v.push;
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
