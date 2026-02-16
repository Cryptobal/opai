import { NextRequest, NextResponse } from "next/server";
import {
  requireAuth,
  unauthorized,
  resolveApiPerms,
} from "@/lib/api-auth";
import { canView } from "@/lib/permissions";
import { getEntry } from "@/modules/finance/accounting/journal-entry.service";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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

    const { id } = await params;
    const entry = await getEntry(ctx.tenantId, id);
    return NextResponse.json({ success: true, data: entry });
  } catch (error) {
    console.error("[Finance Journal Entry] Error:", error);
    return NextResponse.json(
      { success: false, error: "Error al obtener asiento contable" },
      { status: 500 }
    );
  }
}
