import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const ctx = await requireAuth();
  if (!ctx) return unauthorized();

  const contactId = request.nextUrl.searchParams.get("contactId");
  const limit = Math.min(
    parseInt(request.nextUrl.searchParams.get("limit") ?? "50"),
    200
  );

  const logs = await prisma.portalClienteAuditLog.findMany({
    where: {
      tenantId: ctx.tenantId,
      ...(contactId ? { contactId } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  return NextResponse.json({ data: logs });
}
