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
import { isBankConnected } from "@/modules/finance/cashflow/bank-connection.service";

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
  const bankConnected = await isBankConnected(ctx.tenantId);

  return NextResponse.json({ success: true, data: { snapshot, history, bankConnected } });
}

const postSchema = z
  .object({
    weekEnd: z.coerce.date(),
    notes: z.string().max(1000).optional(),
    anchor: z.boolean().optional().default(false),
    varianceResolution: z.enum(["ADJUSTED", "ACCEPTED", "PENDING"]).optional(),
    mode: z.enum(["real", "manual"]).optional().default("real"),
    forcedBalanceClp: z.number().int().optional(),
    manualReason: z.string().min(5).max(500).optional(),
  })
  .refine(
    (d) => d.mode !== "manual" || (d.forcedBalanceClp != null && d.manualReason != null),
    { message: "mode=manual requiere forcedBalanceClp y manualReason" },
  );

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
      mode: parsed.data.mode,
      forcedBalanceClp: parsed.data.forcedBalanceClp,
      manualReason: parsed.data.manualReason,
    });
    return NextResponse.json({
      success: true,
      data: closed,
      mode: parsed.data.mode,
      adjustCreated: closed.adjustOccurrenceId != null,
    });
  } catch (e) {
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : "Error" },
      { status: 400 },
    );
  }
}
