import { NextRequest, NextResponse } from "next/server";
import {
  requireAuth,
  unauthorized,
  resolveApiPerms,
} from "@/lib/api-auth";
import { hasCapability } from "@/lib/permissions";
import { reverseEntry } from "@/modules/finance/accounting/journal-entry.service";

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
    const body = await request.json().catch(() => ({}));
    const date = body.date || new Date().toISOString().slice(0, 10);

    const entry = await reverseEntry(ctx.tenantId, id, ctx.userId, date);
    return NextResponse.json({ success: true, data: entry }, { status: 201 });
  } catch (error) {
    console.error("[Finance Journal Reverse] Error:", error);
    return NextResponse.json(
      { success: false, error: "Error al reversar asiento" },
      { status: 500 }
    );
  }
}
