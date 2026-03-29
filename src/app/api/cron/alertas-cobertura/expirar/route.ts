import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Cron: Expiración de alertas de cobertura por TTL.
// Frecuencia: cada 5 minutos
// Marca como EXPIRADA las alertas ACTIVAS cuyo expiraAt ya pasó.
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const ahora = new Date();

    const resultado = await prisma.opsAlertaCobertura.updateMany({
      where: {
        estado: "ACTIVA",
        expiraAt: { lte: ahora },
      },
      data: {
        estado: "EXPIRADA",
      },
    });

    if (resultado.count > 0) {
      console.log(
        `[AlertaCobertura:Cron:Expirar] ${resultado.count} alertas expiradas por TTL`,
      );
    }

    return NextResponse.json({
      success: true,
      expiradas: resultado.count,
    });
  } catch (error) {
    console.error("[AlertaCobertura:Cron:Expirar] Error:", error);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}
