import { NextRequest, NextResponse } from "next/server";
import {
  requireAuth,
  unauthorized,
  resolveApiPerms,
  parseBody,
} from "@/lib/api-auth";
import { canView, hasCapability } from "@/lib/permissions";
import { openPeriodSchema } from "@/lib/validations/finance";
import {
  listPeriods,
  openPeriod,
} from "@/modules/finance/accounting/period.service";

export async function GET() {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await resolveApiPerms(ctx);
    if (!canView(perms, "finance")) {
      return NextResponse.json(
        { success: false, error: "Sin permisos" },
        { status: 403 }
      );
    }

    const periods = await listPeriods(ctx.tenantId);
    return NextResponse.json({ success: true, data: periods });
  } catch (error) {
    console.error("[Finance Periods] Error:", error);
    return NextResponse.json(
      { success: false, error: "Error al obtener períodos" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await resolveApiPerms(ctx);
    if (!hasCapability(perms, "rendicion_configure")) {
      return NextResponse.json(
        { success: false, error: "Sin permisos" },
        { status: 403 }
      );
    }

    const parsed = await parseBody(request, openPeriodSchema);
    if (parsed.error) return parsed.error;
    const body = parsed.data;

    const period = await openPeriod(ctx.tenantId, body.year, body.month);
    return NextResponse.json(
      { success: true, data: period },
      { status: 201 }
    );
  } catch (error) {
    console.error("[Finance Periods] Error:", error);
    return NextResponse.json(
      { success: false, error: "Error al abrir período" },
      { status: 500 }
    );
  }
}
