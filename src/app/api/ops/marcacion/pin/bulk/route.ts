/**
 * POST /api/ops/marcacion/pin/bulk
 * Regenera el PIN de marcación para todos los guardias activos que aún no
 * tienen un PIN hash visible en la ficha (marcacionPinVisible IS NULL).
 * Devuelve los PINs en texto plano en la respuesta — ESTA ES LA ÚNICA
 * OPORTUNIDAD de verlos; ya no se persisten en la base de datos (Ley 21.719).
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
      select: {
        id: true,
        persona: { select: { firstName: true, lastName: true, rut: true } },
      },
    });

    const generated: Array<{
      guardiaId: string;
      guardiaName: string;
      rut: string | null;
      pin: string;
    }> = [];

    for (const g of guardias) {
      const plainPin = generatePin();
      const hashedPin = await bcrypt.hash(plainPin, 10);
      // Ley 21.719: solo persistimos el hash del PIN. El texto plano se
      // devuelve UNA vez en la respuesta y no se almacena en la BD.
      await prisma.opsGuardia.update({
        where: { id: g.id },
        data: { marcacionPin: hashedPin },
      });
      generated.push({
        guardiaId: g.id,
        guardiaName: `${g.persona.firstName} ${g.persona.lastName}`,
        rut: g.persona.rut,
        pin: plainPin,
      });
    }

    const updated = generated.length;

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
      data: { updated, total: guardias.length, generated },
      message: `Se generaron PINs para ${updated} guardia${updated !== 1 ? "s" : ""}. Estos PINs solo se muestran una vez.`,
    });
  } catch (error) {
    console.error("[ops/marcacion/pin/bulk] Error:", error);
    return NextResponse.json(
      { success: false, error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}
