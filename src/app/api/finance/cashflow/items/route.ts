import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorized, resolveApiPerms, parseBody } from "@/lib/api-auth";
import { hasCapability } from "@/lib/permissions";
import { listItems, createItem } from "@/modules/finance/cashflow/item.service";
import { createCashflowItemSchema } from "@/lib/validations/cashflow";
import type { FinanceCashflowItemKind, FinanceCashflowItemSource } from "@prisma/client";

export async function GET(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await resolveApiPerms(ctx);
    if (!hasCapability(perms, "cashflow_view")) {
      return NextResponse.json({ success: false, error: "Sin permisos" }, { status: 403 });
    }
    const url = new URL(request.url);
    const kind = url.searchParams.get("kind") as FinanceCashflowItemKind | null;
    const source = url.searchParams.get("source") as FinanceCashflowItemSource | null;
    const isActiveStr = url.searchParams.get("isActive");
    const installationId = url.searchParams.get("installationId");

    const items = await listItems(ctx.tenantId, {
      ...(kind && { kind }),
      ...(source && { source }),
      ...(isActiveStr !== null && { isActive: isActiveStr === "true" }),
      ...(installationId && { installationId }),
    });
    return NextResponse.json({ success: true, data: items });
  } catch (error) {
    console.error("[Finance/Cashflow] GET items:", error);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await resolveApiPerms(ctx);
    if (!hasCapability(perms, "cashflow_manage")) {
      return NextResponse.json({ success: false, error: "Sin permisos" }, { status: 403 });
    }
    const parsed = await parseBody(request, createCashflowItemSchema);
    if (parsed.error) return parsed.error;
    const created = await createItem(ctx.tenantId, ctx.userId, parsed.data);
    return NextResponse.json({ success: true, data: created }, { status: 201 });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Error interno";
    console.error("[Finance/Cashflow] POST items:", error);
    return NextResponse.json({ success: false, error: msg }, { status: 400 });
  }
}
