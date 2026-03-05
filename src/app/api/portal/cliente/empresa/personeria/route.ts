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

  const data = await prisma.accountPersoneria.findUnique({
    where: { accountId: session.accountId },
    select: {
      id: true,
      fechaEscritura: true,
      tipoEscritura: true,
      notaria: true,
    },
  });

  return NextResponse.json({ success: true, data });
}

export async function PUT(req: Request) {
  const cookieStore = await cookies();
  const session = parsePortalClienteSessionCookie(
    cookieStore.get("portal_cliente_session")?.value
  );
  if (!session) return NextResponse.json({ error: "No session" }, { status: 401 });

  const body = await req.json();
  const { fechaEscritura, tipoEscritura, notaria } = body as {
    fechaEscritura?: string;
    tipoEscritura?: string;
    notaria?: string;
  };

  const data = await prisma.accountPersoneria.upsert({
    where: { accountId: session.accountId },
    create: {
      tenantId: session.tenantId,
      accountId: session.accountId,
      fechaEscritura: fechaEscritura ? new Date(fechaEscritura) : null,
      tipoEscritura: tipoEscritura ?? null,
      notaria: notaria ?? null,
    },
    update: {
      ...(fechaEscritura !== undefined && {
        fechaEscritura: fechaEscritura ? new Date(fechaEscritura) : null,
      }),
      ...(tipoEscritura !== undefined && { tipoEscritura }),
      ...(notaria !== undefined && { notaria }),
    },
    select: {
      id: true,
      fechaEscritura: true,
      tipoEscritura: true,
      notaria: true,
    },
  });

  return NextResponse.json({ success: true, data });
}
