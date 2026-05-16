import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth, unauthorized, resolveApiPerms, parseBody } from "@/lib/api-auth";
import { hasCapability } from "@/lib/permissions";
import {
  computeWeeklyCloseSnapshot,
  persistWeeklyClose,
  nextWeekClosingDate,
  listRecentCloses,
} from "@/modules/finance/cashflow/weekly-close.service";

export async function GET(request: NextRequest) {
  const ctx = await requireAuth();
  if (!ctx) return unauthorized();
  const perms = await resolveApiPerms(ctx);
  if (!hasCapability(perms, "cashflow_view")) {
    return NextResponse.json({ success: false, error: "Sin permisos" }, { status: 403 });
  }
  const sp = new URL(request.url).searchParams;
  const dateParam = sp.get("weekEnd");
  const weekEnd = dateParam ? new Date(dateParam) : await nextWeekClosingDate(ctx.tenantId);
  const includeHistory = sp.get("history") === "1";

  const snapshot = await computeWeeklyCloseSnapshot(ctx.tenantId, weekEnd);
  const history = includeHistory ? await listRecentCloses(ctx.tenantId) : undefined;

  return NextResponse.json({ success: true, data: { snapshot, history } });
}

const postSchema = z.object({
  weekEnd: z.coerce.date(),
  notes: z.string().max(1000).optional(),
  anchor: z.boolean().optional().default(false),
  varianceResolution: z.enum(["ADJUSTED", "ACCEPTED", "PENDING"]).optional(),
});

export async function POST(request: NextRequest) {
  const ctx = await requireAuth();
  if (!ctx) return unauthorized();
  const perms = await resolveApiPerms(ctx);
  if (!hasCapability(perms, "cashflow_manage")) {
    return NextResponse.json({ success: false, error: "Sin permisos" }, { status: 403 });
  }
  const parsed = await parseBody(request, postSchema);
  if (parsed.error) return parsed.error;
  try {
    const closed = await persistWeeklyClose(ctx.tenantId, ctx.userId, {
      weekEnd: parsed.data.weekEnd,
      notes: parsed.data.notes,
      anchor: parsed.data.anchor,
      varianceResolution: parsed.data.varianceResolution,
    });
    return NextResponse.json({ success: true, data: closed });
  } catch (e) {
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : "Error" },
      { status: 400 },
    );
  }
}
