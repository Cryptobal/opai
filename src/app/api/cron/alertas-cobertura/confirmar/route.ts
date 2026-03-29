import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAlertaCoberturaConfig } from "@/lib/alertas-cobertura/config";
import { notificarSupervisorConfirmacion } from "@/lib/alertas-cobertura/notificacion.service";
import { addMinutes } from "date-fns";

// Cron: Confirmación post-aceptación de alertas de cobertura.
// Frecuencia: cada 5 minutos
// Busca alertas ACEPTADAS donde aceptadaAt + confirmacionDelayMin <= ahora y confirmadaAt IS NULL.
// La respuesta del supervisor se procesa via PATCH /api/ops/alertas-cobertura/[id]?action=confirmar
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const ahora = new Date();

    // Obtener alertas aceptadas pendientes de confirmación
    const alertasAceptadas = await prisma.opsAlertaCobertura.findMany({
      where: {
        estado: "ACEPTADA",
        aceptadaAt: { not: null },
        confirmadaAt: null,
      },
      select: {
        id: true,
        tenantId: true,
        aceptadaAt: true,
        installationId: true,
        aceptadaPorGuardiaId: true,
        creadaPorId: true,
        installation: { select: { name: true } },
        aceptadaPorGuardia: {
          select: {
            persona: { select: { firstName: true, lastName: true } },
          },
        },
      },
    });

    let notificadas = 0;

    for (const alerta of alertasAceptadas) {
      if (!alerta.aceptadaAt) continue;

      const config = await getAlertaCoberturaConfig(alerta.tenantId);
      const umbralConfirmacion = addMinutes(alerta.aceptadaAt, config.confirmacionDelayMin);

      if (umbralConfirmacion > ahora) continue; // Aún no es tiempo

      const nombreGuardia = alerta.aceptadaPorGuardia?.persona
        ? `${alerta.aceptadaPorGuardia.persona.firstName} ${alerta.aceptadaPorGuardia.persona.lastName}`
        : "Guardia";
      const nombreInstalacion = alerta.installation?.name ?? "instalación";

      // Sprint 3: Enviar notificación real al supervisor
      await notificarSupervisorConfirmacion({
        tenantId: alerta.tenantId,
        alertaId: alerta.id,
        creadaPorId: alerta.creadaPorId,
        guardiaNombre: nombreGuardia,
        instalacionNombre: nombreInstalacion,
      });

      console.log(
        `[AlertaCobertura:Cron:Confirmar] Alerta ${alerta.id}: Notificado supervisor sobre ${nombreGuardia} en ${nombreInstalacion}`,
      );

      notificadas++;
    }

    return NextResponse.json({
      success: true,
      evaluadas: alertasAceptadas.length,
      notificadas,
    });
  } catch (error) {
    console.error("[AlertaCobertura:Cron:Confirmar] Error:", error);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}
