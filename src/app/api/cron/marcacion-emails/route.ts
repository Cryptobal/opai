/**
 * CRON: /api/cron/marcacion-emails
 *
 * Procesa emails de marca manual que fueron diferidos (delay configurado).
 * Se ejecuta cada 5 minutos (o bajo demanda).
 *
 * Busca Settings con category="pending_email" cuyo `sendAfter` ya pasó.
 * Envía el email y elimina el registro.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendAvisoMarcaManual } from "@/lib/marcacion-email";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const now = new Date();

    // Buscar todos los emails pendientes
    const pendingEmails = await prisma.setting.findMany({
      where: {
        category: "pending_email",
        key: { startsWith: "pending_marcacion_email:" },
      },
    });

    if (pendingEmails.length === 0) {
      return NextResponse.json({
        success: true,
        data: { processed: 0, message: "No hay emails pendientes" },
      });
    }

    let sent = 0;
    let skipped = 0;
    let errors = 0;

    for (const pending of pendingEmails) {
      try {
        const data = JSON.parse(pending.value ?? "{}");
        const sendAfter = new Date(data.sendAfter);

        if (sendAfter > now) {
          skipped++;
          continue; // Aún no es momento de enviar
        }

        // Verificar que la marcación manual sigue existiendo (no fue reseteada)
        if (data.asistenciaId && data.marcacionGuardiaId && data.installationId) {
          const todayStart = new Date(data.fechaMarca);
          todayStart.setHours(0, 0, 0, 0);
          const todayEnd = new Date(todayStart);
          todayEnd.setDate(todayEnd.getDate() + 1);

          const marcacionExists = await prisma.opsMarcacion.findFirst({
            where: {
              guardiaId: data.marcacionGuardiaId,
              installationId: data.installationId,
              metodoId: "manual",
              timestamp: { gte: todayStart, lt: todayEnd },
              deletedAt: null,
            },
          });

          if (!marcacionExists) {
            // Marcación fue eliminada (reset) — no enviar email
            await prisma.setting.delete({ where: { id: pending.id } });
            console.log(`[CRON] Email pendiente ${pending.id} cancelado (marcación eliminada)`);
            skipped++;
            continue;
          }
        }

        // Enviar email
        await sendAvisoMarcaManual({
          guardiaName: data.guardiaName,
          guardiaEmail: data.guardiaEmail,
          guardiaRut: data.guardiaRut,
          installationName: data.installationName,
          empresaName: data.empresaName,
          empresaRut: data.empresaRut,
          tipo: data.tipo,
          fechaMarca: data.fechaMarca,
          horaMarca: data.horaMarca,
          tipoAjuste: data.tipoAjuste,
          hashIntegridad: data.hashIntegridad,
          registradoPor: data.registradoPor,
          clausulaLegal: data.clausulaLegal,
        });

        // Limpiar registro
        await prisma.setting.delete({ where: { id: pending.id } });
        sent++;
        console.log(`[CRON] Email de marca manual enviado a ${data.guardiaEmail}`);
      } catch (err) {
        errors++;
        console.error(`[CRON] Error procesando email pendiente ${pending.id}:`, err);
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        total: pendingEmails.length,
        sent,
        skipped,
        errors,
      },
    });
  } catch (error) {
    console.error("[CRON] Error en marcacion-emails:", error);
    return NextResponse.json(
      { success: false, error: "Error procesando emails pendientes" },
      { status: 500 }
    );
  }
}
