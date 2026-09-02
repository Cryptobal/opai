import { NextRequest, NextResponse } from "next/server";
import { requirePlatformAuth } from "@/lib/platform-api-auth";
import {
  getAllPlatformSettings,
  isPlatformSettingKey,
  PLATFORM_SETTING_DEFAULTS,
  setPlatformSettings,
  type PlatformSettingKey,
} from "@/lib/platform/settings";
import { logPlatformAction, platformActor } from "@/lib/platform/audit";

export async function GET() {
  const auth = await requirePlatformAuth({ minRole: "owner" });
  if (!auth.ok) return auth.response;
  const settings = await getAllPlatformSettings();
  return NextResponse.json({ settings, defaults: PLATFORM_SETTING_DEFAULTS });
}

export async function PATCH(request: NextRequest) {
  const auth = await requirePlatformAuth({ minRole: "owner" });
  if (!auth.ok) return auth.response;
  const ctx = auth.ctx;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const updates: Partial<Record<PlatformSettingKey, unknown>> = {};
  for (const [key, value] of Object.entries(body)) {
    if (!isPlatformSettingKey(key)) {
      return NextResponse.json({ error: `Clave desconocida: ${key}` }, { status: 400 });
    }
    updates[key] = value;
  }

  const before = await getAllPlatformSettings();
  const settings = await setPlatformSettings(updates, ctx.email);
  await logPlatformAction({
    ...platformActor(ctx),
    action: "settings.update",
    targetType: "PlatformSetting",
    before,
    after: updates,
    request,
  });
  return NextResponse.json({ success: true, settings });
}
