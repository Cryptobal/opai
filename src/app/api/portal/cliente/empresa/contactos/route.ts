import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { parsePortalClienteSessionCookie } from "@/lib/portal-cliente";

async function getSession() {
  const cookieStore = await cookies();
  return parsePortalClienteSessionCookie(
    cookieStore.get("portal_cliente_session")?.value
  );
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No session" }, { status: 401 });

  const body = await req.json();
  const { firstName, lastName, email, phone, roleTitle } = body as {
    firstName: string;
    lastName: string;
    email?: string;
    phone?: string;
    roleTitle?: string;
  };

  if (!firstName?.trim() || !lastName?.trim()) {
    return NextResponse.json({ error: "Nombre y apellido son requeridos" }, { status: 400 });
  }

  const created = await prisma.crmContact.create({
    data: {
      tenantId: session.tenantId,
      accountId: session.accountId,
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      email: email?.trim() || null,
      phone: phone?.trim() || null,
      roleTitle: roleTitle?.trim() || null,
    },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      phone: true,
      roleTitle: true,
      isPrimary: true,
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
  const { id, firstName, lastName, email, roleTitle } = body as {
    id: string;
    firstName?: string;
    lastName?: string;
    email?: string;
    roleTitle?: string;
  };

  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  // Verify contact belongs to session account
  const existing = await prisma.crmContact.findFirst({
    where: { id, accountId: session.accountId },
  });
  if (!existing) {
    return NextResponse.json({ error: "Contact not found" }, { status: 404 });
  }

  const updated = await prisma.crmContact.update({
    where: { id },
    data: {
      ...(firstName !== undefined && { firstName }),
      ...(lastName !== undefined && { lastName }),
      ...(email !== undefined && { email }),
      ...(roleTitle !== undefined && { roleTitle }),
    },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      roleTitle: true,
    },
  });

  return NextResponse.json({ success: true, data: updated });
}
