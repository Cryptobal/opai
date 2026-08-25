import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { requireLaboralesView } from "@/lib/docs/laborales/perms";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await requireAuth();
  if (!ctx) return unauthorized();
  const forbidden = await requireLaboralesView(ctx);
  if (forbidden) return forbidden;
  const { id } = await params;
  const template = await prisma.docTemplate.findFirst({
    where: { id, tenantId: ctx.tenantId, module: "laboral" },
    include: {
      signers: { orderBy: { signingOrder: "asc" } },
      installations: true,
    },
  });
  if (!template) {
    return NextResponse.json({ success: false, error: "Plantilla no encontrada" }, { status: 404 });
  }
  return NextResponse.json({ success: true, data: template });
}
