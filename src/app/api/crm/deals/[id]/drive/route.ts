import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { requireCrmEdit, requireCrmView } from "@/lib/api-auth-crm";
import { requireTenantModule } from "@/lib/require-module";
import {
  ensureDealDriveFolderAndBackfill,
  getDealDriveFolderStatus,
} from "@/lib/google-workspace/drive-deal-folder";
import { importDealFilesFromDrive } from "@/lib/google-workspace/drive-deal-import";

async function assertDeal(tenantId: string, dealId: string) {
  const deal = await prisma.crmDeal.findFirst({
    where: { id: dealId, tenantId },
    select: { id: true },
  });
  return !!deal;
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const modCheck = await requireTenantModule("crm");
    if (!modCheck.authorized) return modCheck.response;

    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await requireCrmView(ctx, "deals");
    if (forbidden) return forbidden;

    const { id } = await params;
    if (!(await assertDeal(ctx.tenantId, id))) {
      return NextResponse.json({ success: false, error: "Negocio no encontrado" }, { status: 404 });
    }

    const data = await getDealDriveFolderStatus(ctx.tenantId, id);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("[crm/deals/drive] GET:", error);
    return NextResponse.json({ success: false, error: "Error al consultar Drive" }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const modCheck = await requireTenantModule("crm");
    if (!modCheck.authorized) return modCheck.response;

    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await requireCrmEdit(ctx, "deals");
    if (forbidden) return forbidden;

    const { id } = await params;
    if (!(await assertDeal(ctx.tenantId, id))) {
      return NextResponse.json({ success: false, error: "Negocio no encontrado" }, { status: 404 });
    }

    // Body opcional: { action: "import" } → Drive→OPAI; sin body → ensure carpeta.
    const body = await request.json().catch(() => null);
    if (body && typeof body === "object" && (body as { action?: string }).action === "import") {
      const data = await importDealFilesFromDrive(ctx.tenantId, id);
      return NextResponse.json({ success: true, data });
    }

    const data = await ensureDealDriveFolderAndBackfill(ctx.tenantId, id);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Error al crear carpeta";
    const status = msg.includes("no está conectado") ? 400 : 500;
    console.error("[crm/deals/drive] POST:", error);
    return NextResponse.json({ success: false, error: msg }, { status });
  }
}
