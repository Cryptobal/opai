import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getDefaultTenantId } from "@/lib/tenant";
import { validateRut } from "@/modules/finance/shared/validators/rut.validator";
import { syncRepresentanteLegacyFields } from "@/lib/crm-representante-sync";

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

  const data = await prisma.accountRepresentanteLegal.findMany({
    where: { accountId, tenantId },
    select: { id: true, nombre: true, rut: true },
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json({ success: true, data });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const tenantId = await getTenantId();
  if (!tenantId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id: accountId } = await params;

  const body = await req.json();
  const { nombre, rut } = body as { nombre: string; rut: string };

  if (!nombre?.trim() || !rut?.trim()) {
    return NextResponse.json({ error: "nombre and rut are required" }, { status: 400 });
  }

  const rutResult = validateRut(rut);
  if (!rutResult.valid) {
    return NextResponse.json({ error: rutResult.error || "RUT inválido" }, { status: 400 });
  }

  const created = await prisma.accountRepresentanteLegal.create({
    data: { tenantId, accountId, nombre: nombre.trim(), rut: rut.trim() },
    select: { id: true, nombre: true, rut: true },
  });

  await syncRepresentanteLegacyFields(accountId);
  return NextResponse.json({ success: true, data: created });
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const tenantId = await getTenantId();
  if (!tenantId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id: accountId } = await params;

  const body = await req.json();
  const { id, nombre, rut } = body as { id: string; nombre: string; rut: string };

  if (!id || !nombre?.trim() || !rut?.trim()) {
    return NextResponse.json({ error: "id, nombre and rut are required" }, { status: 400 });
  }

  const rutResult = validateRut(rut);
  if (!rutResult.valid) {
    return NextResponse.json({ error: rutResult.error || "RUT inválido" }, { status: 400 });
  }

  const existing = await prisma.accountRepresentanteLegal.findFirst({
    where: { id, accountId, tenantId },
  });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const updated = await prisma.accountRepresentanteLegal.update({
    where: { id },
    data: { nombre: nombre.trim(), rut: rut.trim() },
    select: { id: true, nombre: true, rut: true },
  });

  await syncRepresentanteLegacyFields(accountId);
  return NextResponse.json({ success: true, data: updated });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const tenantId = await getTenantId();
  if (!tenantId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id: accountId } = await params;

  const repId = req.nextUrl.searchParams.get("repId");
  if (!repId) return NextResponse.json({ error: "repId is required" }, { status: 400 });

  const existing = await prisma.accountRepresentanteLegal.findFirst({
    where: { id: repId, accountId, tenantId },
  });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.accountRepresentanteLegal.delete({ where: { id: repId } });

  await syncRepresentanteLegacyFields(accountId);
  return NextResponse.json({ success: true });
}
