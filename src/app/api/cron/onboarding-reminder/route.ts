/**
 * API Route: /api/cron/onboarding-reminder
 * GET - Envía recordatorio 48h a guardias que no han accedido a ningún portal
 *
 * Ejecutar cada 6 horas vía Vercel Cron.
 * Protegido con CRON_SECRET.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { subHours } from "date-fns";
import { sendEmailToGuardia } from "@/lib/email/onboarding-email-service";

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET;
    if (!cronSecret && process.env.NODE_ENV === "production") {
      return NextResponse.json(
        { success: false, error: "CRON_SECRET not configured" },
        { status: 500 }
      );
    }
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const cutoff = subHours(new Date(), 48);

    const pendientes = await prisma.opsOnboardingStatus.findMany({
      where: {
        estado: "ENVIADO",
        emailEnviado: true,
        fechaEnvio: { lt: cutoff },
        recordatorioEnviado: false,
        accesoPortalGuardia: false,
        accesoPortalRondas: false,
        accesoPortalAcceso: false,
      },
      include: {
        guardia: {
          include: {
            persona: true,
          },
        },
      },
    });

    let enviados = 0;
    let errores = 0;

    const template = await prisma.opsEmailTemplate.findFirst({
      where: {
        tipo: "RECORDATORIO",
        esDefault: true,
        activo: true,
      },
    });

    if (!template) {
      return NextResponse.json({
        success: true,
        message: "No hay plantilla RECORDATORIO default",
        pendientes: pendientes.length,
        enviados: 0,
      });
    }

    const contenido = template.contenido as Array<{
      id: string;
      tipo: string;
      contenido: Record<string, unknown>;
      orden: number;
    }>;

    for (const status of pendientes) {
      const email =
        status.guardia.personalEmail ??
        status.guardia.persona?.personalEmail ??
        status.guardia.persona?.email;

      if (!email) {
        errores += 1;
        continue;
      }

      const result = await sendEmailToGuardia({
        tenantId: status.tenantId,
        guardiaId: status.guardiaId,
        templateId: template.id,
        asunto: template.asunto,
        contenido,
        tipo: "AUTOMATICO",
        trigger: "RECORDATORIO_48H",
      });

      if (result.success) {
        await prisma.opsOnboardingStatus.update({
          where: { id: status.id },
          data: {
            recordatorioEnviado: true,
            fechaRecordatorio: new Date(),
          },
        });
        enviados += 1;
      } else {
        errores += 1;
      }
    }

    return NextResponse.json({
      success: true,
      pendientes: pendientes.length,
      enviados,
      errores,
    });
  } catch (error) {
    console.error("[CRON] onboarding-reminder error:", error);
    return NextResponse.json(
      { success: false, error: (error as Error).message },
      { status: 500 }
    );
  }
}
