import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { parsePortalClienteSessionCookie } from "@/lib/portal-cliente";

export async function GET() {
  const cookieStore = await cookies();
  const session = parsePortalClienteSessionCookie(
    cookieStore.get("portal_cliente_session")?.value
  );
  if (!session) return NextResponse.json({ error: "No session" }, { status: 401 });

  const installations = await prisma.crmInstallation.findMany({
    where: { accountId: session.accountId, isActive: true },
    select: {
      id: true,
      name: true,
      address: true,
      city: true,
      commune: true,
      lat: true,
      lng: true,
    },
    orderBy: { name: "asc" },
  });

  return NextResponse.json({ success: true, data: installations });
}

export async function POST(req: Request) {
  const cookieStore = await cookies();
  const session = parsePortalClienteSessionCookie(
    cookieStore.get("portal_cliente_session")?.value
  );
  if (!session) return NextResponse.json({ error: "No session" }, { status: 401 });

  const body = await req.json();
  const { name, address, city, commune, lat, lng } = body as {
    name: string;
    address?: string;
    city?: string;
    commune?: string;
    lat?: number;
    lng?: number;
  };

  if (!name?.trim()) {
    return NextResponse.json({ error: "Nombre es requerido" }, { status: 400 });
  }

  const created = await prisma.crmInstallation.create({
    data: {
      tenantId: session.tenantId,
      accountId: session.accountId,
      name: name.trim(),
      address: address?.trim() || null,
      city: city?.trim() || null,
      commune: commune?.trim() || null,
      lat: lat ?? null,
      lng: lng ?? null,
      isActive: true,
    },
    select: {
      id: true,
      name: true,
      address: true,
      city: true,
      commune: true,
      lat: true,
      lng: true,
    },
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
  const { id, name, address, city, commune, lat, lng } = body as {
    id: string;
    name?: string;
    address?: string;
    city?: string;
    commune?: string;
    lat?: number;
    lng?: number;
  };

  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  // Verify installation belongs to session account
  const existing = await prisma.crmInstallation.findFirst({
    where: { id, accountId: session.accountId },
  });
  if (!existing) {
    return NextResponse.json({ error: "Installation not found" }, { status: 404 });
  }

  const updated = await prisma.crmInstallation.update({
    where: { id },
    data: {
      ...(name !== undefined && { name }),
      ...(address !== undefined && { address }),
      ...(city !== undefined && { city }),
      ...(commune !== undefined && { commune }),
      ...(lat !== undefined && { lat }),
      ...(lng !== undefined && { lng }),
    },
    select: {
      id: true,
      name: true,
      address: true,
      city: true,
      commune: true,
      lat: true,
      lng: true,
    },
  });

  return NextResponse.json({ success: true, data: updated });
}
