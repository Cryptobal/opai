import { NextRequest, NextResponse } from "next/server";
import {
  requireAuth,
  unauthorized,
  resolveApiPerms,
  parseBody,
} from "@/lib/api-auth";
import { canView, hasCapability } from "@/lib/permissions";
import { createJournalEntrySchema } from "@/lib/validations/finance";
import {
  listEntries,
  createManualEntry,
} from "@/modules/finance/accounting/journal-entry.service";

export async function GET(request: NextRequest) {
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

    const { searchParams } = new URL(request.url);
    const filters = {
      dateFrom: searchParams.get("dateFrom") || undefined,
      dateTo: searchParams.get("dateTo") || undefined,
      status: searchParams.get("status") || undefined,
      sourceType: searchParams.get("sourceType") || undefined,
      page: searchParams.get("page")
        ? parseInt(searchParams.get("page")!)
        : undefined,
      pageSize: searchParams.get("pageSize")
        ? parseInt(searchParams.get("pageSize")!)
        : undefined,
    };

    const entries = await listEntries(ctx.tenantId, filters);
    return NextResponse.json({ success: true, data: entries });
  } catch (error) {
    console.error("[Finance Journal] Error:", error);
    return NextResponse.json(
      { success: false, error: "Error al obtener asientos contables" },
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

    const parsed = await parseBody(request, createJournalEntrySchema);
    if (parsed.error) return parsed.error;
    const body = parsed.data;

    const entry = await createManualEntry(ctx.tenantId, ctx.userId, body);
    return NextResponse.json({ success: true, data: entry }, { status: 201 });
  } catch (error) {
    console.error("[Finance Journal] Error:", error);
    return NextResponse.json(
      { success: false, error: "Error al crear asiento contable" },
      { status: 500 }
    );
  }
}
