import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getDefaultTenantId } from "@/lib/tenant";

async function getTenantId() {
  const session = await auth();
  if (!session?.user) return null;
  return session.user.tenantId ?? (await getDefaultTenantId());
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const tenantId = await getTenantId();
  if (!tenantId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id: accountId } = await params;

  const data = await prisma.accountPersoneria.findFirst({
    where: { accountId, tenantId },
    select: { id: true, fechaEscritura: true, tipoEscritura: true, notaria: true },
  });

  return NextResponse.json({ success: true, data });
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const tenantId = await getTenantId();
  if (!tenantId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id: accountId } = await params;

  const body = await req.json();
  const { fechaEscritura, tipoEscritura, notaria } = body as {
    fechaEscritura?: string | null;
    tipoEscritura?: string | null;
    notaria?: string | null;
  };

  const data = await prisma.accountPersoneria.upsert({
    where: { accountId },
    create: {
      tenantId,
      accountId,
      fechaEscritura: fechaEscritura ? new Date(fechaEscritura) : null,
      tipoEscritura: tipoEscritura?.trim() || null,
      notaria: notaria?.trim() || null,
    },
    update: {
      fechaEscritura: fechaEscritura ? new Date(fechaEscritura) : null,
      tipoEscritura: tipoEscritura?.trim() || null,
      notaria: notaria?.trim() || null,
    },
    select: { id: true, fechaEscritura: true, tipoEscritura: true, notaria: true },
  });

  return NextResponse.json({ success: true, data });
}
