import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { parsePortalClienteSessionCookie } from "@/lib/portal-cliente";
import { validateRut } from "@/modules/finance/shared/validators/rut.validator";

export async function GET() {
  const cookieStore = await cookies();
  const session = parsePortalClienteSessionCookie(
    cookieStore.get("portal_cliente_session")?.value
  );
  if (!session) return NextResponse.json({ error: "No session" }, { status: 401 });

  const data = await prisma.accountRepresentanteLegal.findMany({
    where: { accountId: session.accountId, tenantId: session.tenantId },
    select: { id: true, nombre: true, rut: true },
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json({ success: true, data });
}

export async function POST(req: Request) {
  const cookieStore = await cookies();
  const session = parsePortalClienteSessionCookie(
    cookieStore.get("portal_cliente_session")?.value
  );
  if (!session) return NextResponse.json({ error: "No session" }, { status: 401 });

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
    data: {
      tenantId: session.tenantId,
      accountId: session.accountId,
      nombre: nombre.trim(),
      rut: rut.trim(),
    },
    select: { id: true, nombre: true, rut: true },
  });

  return NextResponse.json({ success: true, data: created });
}

export async function PUT(req: Request) {
  const cookieStore = await cookies();
  const session = parsePortalClienteSessionCookie(
    cookieStore.get("portal_cliente_session")?.value
  );
  if (!session) return NextResponse.json({ error: "No session" }, { status: 401 });

  const body = await req.json();
  const { id, nombre, rut } = body as { id: string; nombre: string; rut: string };

  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }
  if (!nombre?.trim() || !rut?.trim()) {
    return NextResponse.json({ error: "nombre and rut are required" }, { status: 400 });
  }

  const rutResult = validateRut(rut);
  if (!rutResult.valid) {
    return NextResponse.json({ error: rutResult.error || "RUT inválido" }, { status: 400 });
  }

  // Verify ownership
  const existing = await prisma.accountRepresentanteLegal.findFirst({
    where: { id, accountId: session.accountId, tenantId: session.tenantId },
  });
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const updated = await prisma.accountRepresentanteLegal.update({
    where: { id },
    data: { nombre: nombre.trim(), rut: rut.trim() },
    select: { id: true, nombre: true, rut: true },
  });

  return NextResponse.json({ success: true, data: updated });
}

export async function DELETE(req: NextRequest) {
  const cookieStore = await cookies();
  const session = parsePortalClienteSessionCookie(
    cookieStore.get("portal_cliente_session")?.value
  );
  if (!session) return NextResponse.json({ error: "No session" }, { status: 401 });

  const id = req.nextUrl.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  // Verify ownership
  const existing = await prisma.accountRepresentanteLegal.findFirst({
    where: { id, accountId: session.accountId, tenantId: session.tenantId },
  });
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await prisma.accountRepresentanteLegal.delete({ where: { id } });

  return NextResponse.json({ success: true });
}
