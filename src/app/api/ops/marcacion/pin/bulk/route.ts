/**
 * POST /api/ops/marcacion/pin/bulk
 * Genera marcacionPinVisible para todos los guardias activos que tienen marcacionPin
 * pero no marcacionPinVisible. Regenera el PIN (nuevo valor) y actualiza ambos campos.
 * Requiere auth + capability guardias_manage.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api-auth";
import { ensureOpsCapability } from "@/lib/ops";
import { generatePin } from "@/lib/marcacion";
import * as bcrypt from "bcryptjs";
import { logAudit } from "@/lib/audit";

export async function POST() {
  try {
    const auth = await requireAuth();
    if (!auth) {
      return NextResponse.json({ success: false, error: "No autorizado" }, { status: 401 });
    }

    const forbidden = await ensureOpsCapability(auth, "guardias_manage");
    if (forbidden) return forbidden;

    const guardias = await prisma.opsGuardia.findMany({
      where: {
        tenantId: auth.tenantId,
        marcacionPin: { not: null },
        marcacionPinVisible: null,
        lifecycleStatus: { in: ["contratado", "te", "seleccionado"] },
      },
      select: { id: true, persona: { select: { firstName: true, lastName: true } } },
    });

    let updated = 0;
    for (const g of guardias) {
      const plainPin = generatePin();
      const hashedPin = await bcrypt.hash(plainPin, 10);
      await prisma.opsGuardia.update({
        where: { id: g.id },
        data: { marcacionPin: hashedPin, marcacionPinVisible: plainPin },
      });
      updated++;
    }

    await logAudit({
      userId: auth.userId,
      userEmail: auth.userEmail,
      action: "UPDATE",
      entity: "OpsGuardia",
      details: { type: "PIN_BULK_REGENERATED", updated },
      tenantId: auth.tenantId,
    });

    return NextResponse.json({
      success: true,
      data: { updated, total: guardias.length },
      message: `Se generaron PINs visibles para ${updated} guardia${updated !== 1 ? "s" : ""}.`,
    });
  } catch (error) {
    console.error("[ops/marcacion/pin/bulk] Error:", error);
    return NextResponse.json(
      { success: false, error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}
