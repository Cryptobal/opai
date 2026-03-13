/**
 * POST /api/cron/jornada-alerts
 * Evalúa alertas de proximidad de límite de horas semanales.
 * Ejecutar cada hora o al cierre de turno.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getJornadaLimits } from "@/lib/dt/jornada-config";
import { evaluateJornadaAlerts } from "@/lib/dt/jornada-alerts";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function getWeekStart(date: Date): Date {
  const d = new Date(date);
  const day = d.getUTCDay();
  const diff = day === 0 ? 6 : day - 1;
  d.setUTCDate(d.getUTCDate() - diff);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

export async function POST(request: Request) {
  const cronSecret = request.headers.get("authorization")?.replace("Bearer ", "");
  if (cronSecret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const weekStart = getWeekStart(now);

  const tenants = await prisma.tenant.findMany({
    where: { active: true },
    select: { id: true },
  });

  let totalAlerts = 0;

  for (const tenant of tenants) {
    const limits = await getJornadaLimits(tenant.id, now);

    const guardias = await prisma.opsGuardia.findMany({
      where: { tenantId: tenant.id, status: "active" },
      select: {
        id: true,
        persona: { select: { firstName: true, lastName: true } },
        currentInstallation: { select: { name: true } },
      },
    });

    for (const guardia of guardias) {
      const asistencias = await prisma.opsAsistenciaDiaria.findMany({
        where: {
          date: { gte: weekStart, lte: now },
          deletedAt: null,
          OR: [
            { plannedGuardiaId: guardia.id },
            { actualGuardiaId: guardia.id },
          ],
          attendanceStatus: "asistio",
        },
        select: { workedMinutes: true, overtimeMinutes: true, date: true },
      });

      const horasAcumuladasSemana = asistencias.reduce(
        (sum, a) => sum + (a.workedMinutes ?? 0) / 60,
        0
      );

      const today = asistencias.filter(
        (a) => a.date.toISOString().slice(0, 10) === now.toISOString().slice(0, 10)
      );
      const horasDia = today.reduce((s, a) => s + (a.workedMinutes ?? 0) / 60, 0);
      const horasExtrasDia = today.reduce(
        (s, a) => s + (a.overtimeMinutes ?? 0) / 60,
        0
      );

      const guardiaName = guardia.persona
        ? `${guardia.persona.firstName} ${guardia.persona.lastName}`
        : guardia.id;

      const alerts = evaluateJornadaAlerts(
        {
          guardiaId: guardia.id,
          guardiaName,
          installationName: guardia.currentInstallation?.name,
          horasAcumuladasSemana,
          horasDia,
          horasExtrasDia,
        },
        limits
      );

      for (const alert of alerts) {
        await prisma.auditLog.create({
          data: {
            userId: "system",
            userEmail: "system@opai.cl",
            action: `jornada_alert_${alert.type}`,
            entity: "OpsGuardia",
            entityId: guardia.id,
            details: {
              level: alert.level,
              message: alert.message,
              value: alert.value,
              limit: alert.limit,
            },
            tenantId: tenant.id,
          },
        });
      }

      totalAlerts += alerts.length;
    }
  }

  return NextResponse.json({
    success: true,
    totalAlerts,
    timestamp: now.toISOString(),
  });
}
