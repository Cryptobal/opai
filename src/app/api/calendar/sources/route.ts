import { NextRequest, NextResponse } from "next/server";
import { requireAgendaAccess } from "@/lib/api-auth-agenda";
import { listCalendarAccounts } from "@/lib/google-workspace/clients";
import { isValidPaletteKey } from "@/lib/design/calendar-palette";
import {
  listCalendarSources,
  seedHiddenFromLegacy,
  updateAccountColor,
  updateCalendarSourcePref,
} from "@/modules/calendar/calendar-sources";
import { resolveMultiAccount } from "@/modules/shared/multi-account";

export async function GET(request: NextRequest) {
  const auth = await requireAgendaAccess();
  if (!auth.ok) return auth.response;

  const { tenantId, userId } = auth.ctx;
  const legacy = request.nextUrl.searchParams.get("seedLegacy");
  if (legacy) {
    try {
      const keys = JSON.parse(legacy) as string[];
      if (Array.isArray(keys) && keys.length) {
        await seedHiddenFromLegacy({ tenantId, userId, legacyKeys: keys });
      }
    } catch {
      // ignore bad seed payload
    }
  }

  const [sources, accounts, multi] = await Promise.all([
    listCalendarSources({ tenantId, userId }),
    listCalendarAccounts(tenantId, userId),
    resolveMultiAccount({ tenantId, userId, scope: "agenda" }),
  ]);

  return NextResponse.json({
    sources,
    accounts: accounts.map((a) => ({
      id: a.id,
      googleEmail: a.googleEmail,
      isDefault: a.isDefault,
      color: a.color,
      calendarId: a.calendarId,
      status: a.status,
      sortIndex: a.sortIndex,
    })),
    multiAccount: { enabled: multi.enabled, canConnect: multi.canConnect },
  });
}

export async function PATCH(request: NextRequest) {
  const auth = await requireAgendaAccess();
  if (!auth.ok) return auth.response;

  const { tenantId, userId } = auth.ctx;
  const body = (await request.json()) as {
    sourceKey?: string;
    accountId?: string;
    color?: string;
    hidden?: boolean;
    isCreateTarget?: boolean;
    sortIndex?: number;
  };

  // Cambio de color a nivel cuenta (arrastra heredados).
  if (body.accountId && body.color && !body.sourceKey) {
    if (!isValidPaletteKey(body.color)) {
      return NextResponse.json({ error: "Color inválido" }, { status: 400 });
    }
    try {
      await updateAccountColor({
        tenantId,
        userId,
        accountId: body.accountId,
        color: body.color,
      });
      const sources = await listCalendarSources({ tenantId, userId });
      return NextResponse.json({ ok: true, sources });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg === "ACCOUNT_NOT_FOUND") {
        return NextResponse.json({ error: "Cuenta no encontrada" }, { status: 404 });
      }
      throw err;
    }
  }

  if (!body.sourceKey || typeof body.sourceKey !== "string") {
    return NextResponse.json({ error: "sourceKey requerido" }, { status: 400 });
  }

  try {
    const source = await updateCalendarSourcePref({
      tenantId,
      userId,
      sourceKey: body.sourceKey,
      color: body.color,
      hidden: body.hidden,
      isCreateTarget: body.isCreateTarget,
      sortIndex: body.sortIndex,
    });
    return NextResponse.json({ ok: true, source });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg === "SOURCE_NOT_FOUND") {
      return NextResponse.json({ error: "Fuente no encontrada" }, { status: 404 });
    }
    if (msg === "INVALID_COLOR") {
      return NextResponse.json({ error: "Color inválido" }, { status: 400 });
    }
    if (msg === "CREATE_TARGET_OPAI" || msg === "CREATE_TARGET_READONLY") {
      return NextResponse.json(
        { error: "Ese calendario no puede ser destino de creación" },
        { status: 400 },
      );
    }
    throw err;
  }
}
