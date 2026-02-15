import { NextRequest, NextResponse } from "next/server";
import {
  requireAuth,
  unauthorized,
  resolveApiPerms,
} from "@/lib/api-auth";
import { hasCapability } from "@/lib/permissions";
import { postEntry } from "@/modules/finance/accounting/journal-entry.service";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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

    const { id } = await params;
    const entry = await postEntry(ctx.tenantId, id, ctx.userId);
    return NextResponse.json({ success: true, data: entry });
  } catch (error) {
    console.error("[Finance Journal Post] Error:", error);
    return NextResponse.json(
      { success: false, error: "Error al contabilizar asiento" },
      { status: 500 }
    );
  }
}
