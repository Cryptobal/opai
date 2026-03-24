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
  const { id, name, address, commune } = body as {
    id: string;
    name?: string;
    address?: string;
    commune?: string;
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
      ...(commune !== undefined && { commune }),
    },
    select: {
      id: true,
      name: true,
      address: true,
      commune: true,
    },
  });

  return NextResponse.json({ success: true, data: updated });
}
