import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { parsePortalClienteSessionCookie } from "@/lib/portal-cliente";

/**
 * GET /api/portal/cliente/instalaciones/[id]/equipamiento
 *
 * Returns equipment deliveries (uniforms + assets) for a specific
 * installation belonging to the authenticated client's account.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const cookieStore = await cookies();
    const session = parsePortalClienteSessionCookie(
      cookieStore.get("portal_cliente_session")?.value
    );
    if (!session) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const { id: installationId } = await params;

    // Verify installation belongs to the client's account
    const installation = await prisma.crmInstallation.findFirst({
      where: {
        id: installationId,
        account: { id: session.accountId },
      },
      select: { id: true, name: true },
    });

    if (!installation) {
      return NextResponse.json({ error: "Instalación no encontrada" }, { status: 404 });
    }

    // Get uniform deliveries
    const movements = await prisma.inventoryMovement.findMany({
      where: {
        installationId,
        type: "delivery",
      },
      include: {
        guardia: {
          select: {
            persona: { select: { firstName: true, lastName: true } },
          },
        },
        lines: {
          include: {
            variant: {
              include: {
                product: { select: { name: true, category: true } },
                size: { select: { sizeCode: true } },
              },
            },
          },
        },
      },
      orderBy: { date: "desc" },
      take: 100,
    });

    // Get assigned assets
    const assetAssignments = await prisma.inventoryAssetAssignment.findMany({
      where: {
        installationId,
        returnedAt: null,
      },
      include: {
        asset: {
          include: {
            variant: {
              include: {
                product: { select: { name: true } },
              },
            },
          },
        },
      },
      orderBy: { assignedAt: "desc" },
    });

    const deliveries = movements.map((m) => ({
      id: m.id,
      date: m.date.toISOString(),
      guardiaName: m.guardia
        ? `${m.guardia.persona.firstName} ${m.guardia.persona.lastName}`.trim()
        : null,
      items: m.lines.map((l) => ({
        product: l.variant.product.name,
        size: l.variant.size?.sizeCode || null,
        quantity: l.quantity,
      })),
    }));

    const assets = assetAssignments.map((a) => ({
      id: a.id,
      product: a.asset.variant?.product.name || "Activo",
      assignedAt: a.assignedAt.toISOString(),
    }));

    return NextResponse.json({
      success: true,
      installationName: installation.name,
      deliveries,
      assets,
    });
  } catch (e) {
    console.error("[portal/cliente/instalaciones/[id]/equipamiento GET]", e);
    return NextResponse.json(
      { success: false, error: "Error al cargar equipamiento" },
      { status: 500 },
    );
  }
}
