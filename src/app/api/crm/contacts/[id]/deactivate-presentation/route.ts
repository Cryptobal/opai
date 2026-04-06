import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { requireCrmEdit } from "@/lib/api-auth-crm";
import { requireTenantModule } from '@/lib/require-module';

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const modCheck = await requireTenantModule('crm');
    if (!modCheck.authorized) return modCheck.response;

    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await requireCrmEdit(ctx, "contacts");
    if (forbidden) return forbidden;

    const { id: contactId } = await params;

    const updated = await prisma.crmCompanyPresentation.updateMany({
      where: {
        contactId,
        status: { in: ["sent", "viewed"] },
      },
      data: {
        status: "deactivated",
        deactivatedAt: new Date(),
        deactivatedBy: "manual",
      },
    });

    return NextResponse.json({ success: true, count: updated.count });
  } catch (error) {
    console.error("Error deactivating presentation:", error);
    return NextResponse.json(
      { success: false, error: "Error al desactivar presentación" },
      { status: 500 }
    );
  }
}
