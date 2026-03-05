import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { parsePortalClienteSessionCookie } from "@/lib/portal-cliente";

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
