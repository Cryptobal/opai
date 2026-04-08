import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePortalGuardiaAuth } from "@/lib/portal-guardia-auth";
import { logAudit } from "@/lib/audit";

type ArcoTipo = "rectificacion" | "supresion" | "oposicion" | "bloqueo";
const TIPOS_VALIDOS: ArcoTipo[] = ["rectificacion", "supresion", "oposicion", "bloqueo"];

/**
 * POST /api/portal/guardia/mis-datos/solicitud
 * Crea una solicitud ARCO. Plazo legal de respuesta: 30 días (Ley 21.719).
 */
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      guardiaId?: string;
      tipo?: ArcoTipo;
      detalle?: string;
      campos?: string[];
    };

    const guardAuth = await requirePortalGuardiaAuth(body.guardiaId);
    if (!guardAuth) {
      return NextResponse.json({ success: false, error: "No autorizado" }, { status: 401 });
    }

    if (!body.tipo || !TIPOS_VALIDOS.includes(body.tipo) || !body.detalle) {
      return NextResponse.json(
        { success: false, error: "Tipo y detalle son requeridos" },
        { status: 400 }
      );
    }

    const fechaLimite = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    const solicitud = await prisma.auditLog.create({
      data: {
        userId: guardAuth.guardiaId,
        action: `ARCO_${body.tipo.toUpperCase()}`,
        entity: "OpsPersona",
        entityId: guardAuth.guardiaId,
        details: {
          tipo: body.tipo,
          detalle: body.detalle,
          campos: body.campos ?? [],
          estado: "pendiente",
          fechaLimiteRespuesta: fechaLimite.toISOString(),
        },
        tenantId: guardAuth.tenantId,
      },
    });

    await logAudit({
      userId: guardAuth.guardiaId,
      action: body.tipo === "supresion" ? "DATA_DELETION_REQUEST" : "DATA_ACCESS",
      entity: "ArcoSolicitud",
      entityId: solicitud.id,
      details: { tipo: body.tipo, campos: body.campos ?? [] },
      tenantId: guardAuth.tenantId,
      request,
    });

    return NextResponse.json({
      success: true,
      data: {
        id: solicitud.id,
        tipo: body.tipo,
        estado: "pendiente",
        fechaSolicitud: solicitud.createdAt,
        fechaLimiteRespuesta: fechaLimite,
        mensaje: `Tu solicitud de ${body.tipo} ha sido registrada. Según la Ley 21.719, recibirás respuesta dentro de 30 días.`,
      },
    });
  } catch (error) {
    console.error("[Portal Guardia] ARCO solicitud error:", error);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}
