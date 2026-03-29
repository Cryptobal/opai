import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { addMinutes } from "date-fns";

// Cron: Escalamiento de oleadas de alertas de cobertura.
// Frecuencia: cada 1 minuto
// Busca alertas ACTIVAS cuyo proximaOleadaAt ya pasó y escala a la siguiente oleada.
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const ahora = new Date();

    const alertasPendientes = await prisma.opsAlertaCobertura.findMany({
      where: {
        estado: "ACTIVA",
        proximaOleadaAt: { lte: ahora },
      },
      select: {
        id: true,
        oleadaActual: true,
        oleadasConfig: true,
        expiraAt: true,
      },
    });

    let escaladas = 0;
    let sinMasOleadas = 0;

    for (const alerta of alertasPendientes) {
      const oleadas = (alerta.oleadasConfig ?? []) as { numero: number; tipo: string; radioMinKm: number; radioMaxKm: number; esperaMin: number; guardiaIds: string[]; guardiaCount: number }[];
      const siguienteOleada = alerta.oleadaActual + 1;

      if (siguienteOleada >= oleadas.length) {
        // No hay más oleadas — poner proximaOleadaAt en expiraAt para que no vuelva a entrar
        if (alerta.expiraAt <= ahora) {
          // TTL también vencido, el cron de expiración se encargará
          sinMasOleadas++;
          continue;
        }
        await prisma.opsAlertaCobertura.update({
          where: { id: alerta.id },
          data: { proximaOleadaAt: alerta.expiraAt },
        });
        sinMasOleadas++;
        continue;
      }

      const oleada = oleadas[siguienteOleada];
      const nuevaProximaOleadaAt = addMinutes(ahora, oleada.esperaMin);

      await prisma.opsAlertaCobertura.update({
        where: { id: alerta.id },
        data: {
          oleadaActual: siguienteOleada,
          proximaOleadaAt: nuevaProximaOleadaAt,
        },
      });

      await prisma.opsAlertaOleadaLog.create({
        data: {
          alertaId: alerta.id,
          oleadaNumero: oleada.numero,
          tipo: oleada.tipo,
          radioMinKm: oleada.radioMinKm,
          radioMaxKm: oleada.radioMaxKm,
          guardiasNotificados: oleada.guardiaCount,
        },
      });

      // TODO Sprint 3: notificar guardias de oleada[siguienteOleada].guardiaIds
      console.log(
        `[AlertaCobertura:Cron:Escalar] Alerta ${alerta.id} escalada a oleada ${siguienteOleada} (${oleada.tipo}), ${oleada.guardiaCount} guardias`,
      );
      escaladas++;
    }

    return NextResponse.json({
      success: true,
      procesadas: alertasPendientes.length,
      escaladas,
      sinMasOleadas,
    });
  } catch (error) {
    console.error("[AlertaCobertura:Cron:Escalar] Error:", error);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}
