import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { parsePortalClienteSessionCookie } from "@/lib/portal-cliente";
import { validateRut } from "@/modules/finance/shared/validators/rut.validator";
import { migrateAndGetRepresentantes } from "@/lib/crm-representante-sync";

export async function GET() {
  const cookieStore = await cookies();
  const session = parsePortalClienteSessionCookie(
    cookieStore.get("portal_cliente_session")?.value
  );
  if (!session) return NextResponse.json({ error: "No session" }, { status: 401 });

  try {
    const account = await prisma.crmAccount.findUnique({
      where: { id: session.accountId },
      select: {
        id: true,
        name: true,
        legalName: true,
        rut: true,
        address: true,
        commune: true,
        contacts: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            phone: true,
            roleTitle: true,
            isPrimary: true,
          },
          orderBy: { createdAt: "asc" },
        },
        installations: {
          where: { isActive: true },
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
        },
      },
    });

    if (!account) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 });
    }

    // Fetch representantes (with auto-migration from legacy fields) and personeria
    const representantesLegales = await migrateAndGetRepresentantes(session.accountId, session.tenantId);
    let personeria: { id: string; fechaEscritura: Date | null; tipoEscritura: string | null; notaria: string | null } | null = null;

    try {
      personeria = await prisma.accountPersoneria.findFirst({
        where: { accountId: session.accountId, tenantId: session.tenantId },
        select: { id: true, fechaEscritura: true, tipoEscritura: true, notaria: true },
      });
    } catch {
      // Table may not exist yet
    }

    return NextResponse.json({
      success: true,
      data: { ...account, representantesLegales, personeria },
    });
  } catch (e) {
    console.error("[portal/empresa] GET error:", e);
    return NextResponse.json({ error: "Error al cargar datos de empresa" }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  const cookieStore = await cookies();
  const session = parsePortalClienteSessionCookie(
    cookieStore.get("portal_cliente_session")?.value
  );
  if (!session) return NextResponse.json({ error: "No session" }, { status: 401 });

  const body = await req.json();
  const { name, legalName, rut, address, commune } = body as {
    name?: string;
    legalName?: string;
    rut?: string;
    address?: string;
    commune?: string;
  };

  // Validar RUT si se envía
  if (rut !== undefined && rut.trim() !== "") {
    const rutResult = validateRut(rut);
    if (!rutResult.valid) {
      return NextResponse.json(
        { error: rutResult.error || "RUT inválido" },
        { status: 400 }
      );
    }
  }

  const updated = await prisma.crmAccount.update({
    where: { id: session.accountId },
    data: {
      ...(name !== undefined && { name }),
      ...(legalName !== undefined && { legalName }),
      ...(rut !== undefined && { rut }),
      ...(address !== undefined && { address }),
      ...(commune !== undefined && { commune }),
    },
    select: {
      id: true,
      name: true,
      legalName: true,
      rut: true,
      address: true,
      commune: true,
    },
  });

  return NextResponse.json({ success: true, data: updated });
}
