import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePortalGuardiaAuth } from "@/lib/portal-guardia-auth";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const guardiaId = searchParams.get("guardiaId");

    const guardAuth = await requirePortalGuardiaAuth(guardiaId);
    if (!guardAuth) {
      return NextResponse.json(
        { success: false, error: "Guardia no encontrado o inactivo" },
        { status: 401 },
      );
    }

    const assignments = await prisma.inventoryGuardiaAssignment.findMany({
      where: { guardiaId: guardAuth.guardiaId, tenantId: guardAuth.tenantId, returnedAt: null },
      include: {
        variant: {
          include: {
            product: { select: { name: true, category: true } },
            size: { select: { sizeCode: true } },
          },
        },
        movement: {
          select: {
            id: true,
            date: true,
            confirmationStatus: true,
            confirmedAt: true,
            installation: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: { deliveredAt: "desc" },
    });

    // Group by movement to show pending confirmations
    const movementMap = new Map<string, {
      movementId: string;
      confirmationStatus: string;
      confirmedAt: string | null;
    }>();

    for (const a of assignments) {
      if (!movementMap.has(a.movement.id)) {
        movementMap.set(a.movement.id, {
          movementId: a.movement.id,
          confirmationStatus: a.movement.confirmationStatus,
          confirmedAt: a.movement.confirmedAt?.toISOString() || null,
        });
      }
    }

    return NextResponse.json({
      success: true,
      assignments: assignments.map((a) => ({
        id: a.id,
        movementId: a.movement.id,
        product: a.variant.product.name,
        category: a.variant.product.category,
        size: a.variant.size?.sizeCode || null,
        quantity: a.quantity,
        deliveredAt: a.deliveredAt?.toISOString() || a.movement.date.toISOString(),
        installationName: a.movement.installation?.name || null,
        confirmationStatus: a.movement.confirmationStatus,
        confirmedAt: a.movement.confirmedAt?.toISOString() || null,
      })),
      pendingConfirmations: Array.from(movementMap.values()).filter(
        (m) => m.confirmationStatus === "pending"
      ),
    });
  } catch (e) {
    console.error("[portal/guardia/equipamiento GET]", e);
    return NextResponse.json(
      { success: false, error: "Error al cargar equipamiento" },
      { status: 500 },
    );
  }
}
