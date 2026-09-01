/**
 * Alerta Art. 45.1: falta de marcación a los 30 minutos del inicio/término pactado.
 *
 * Apagada por defecto. Al activarla no se hace backfill histórico: solo se envía
 * si la ventana de 30 min venció en las últimas 2 horas (el cron corre cada 5 min).
 */

import { fromZonedTime } from "date-fns-tz";
import { prisma } from "@/lib/prisma";
import { CHILE_TZ, todayInChile, ymdInChile, addDaysChile, startOfDayChile } from "@/lib/dates-cl";
import { parseMarcacionConfigValue } from "@/lib/ops-marcacion-config";
import { sendAlertaFaltaMarcacion } from "@/lib/marcacion-email";
import { formatPersonName } from "@/lib/personas";
import { resolvePersonalEmail } from "@/lib/marcacion-personal-email";
import { formatFechaComprobante } from "@/lib/marcacion-format";
import { isFaltaAlertDue } from "@/lib/marcacion-alerta-falta-window";

export { FALTA_ALERT_SEND_WINDOW_MS, isFaltaAlertDue } from "@/lib/marcacion-alerta-falta-window";

export const FALTA_ALERT_GRACE_MS = 30 * 60 * 1000;
const SKIP_STATUS = new Set(["ppc", "no_asistio"]);

function chileDateTime(ymd: string, hhmm: string): Date {
  const time = hhmm.length >= 8 ? hhmm.slice(0, 8) : `${hhmm}:00`.slice(0, 8);
  return fromZonedTime(`${ymd}T${time}`, CHILE_TZ);
}

function ymdFromDbDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export async function runAlertaFaltaMarcacion(now: Date = new Date()): Promise<{
  sent: number;
  skippedDisabled: number;
  skippedAlready: number;
  errors: number;
  examined: number;
}> {
  const todayYmd = todayInChile(now);
  const yesterday = addDaysChile(startOfDayChile(now), -1);
  const yesterdayYmd = ymdInChile(yesterday);

  const tenants = await prisma.tenant.findMany({
    where: { active: true },
    select: { id: true },
  });

  let sent = 0;
  let skippedDisabled = 0;
  let skippedAlready = 0;
  let errors = 0;
  let examined = 0;

  for (const tenant of tenants) {
    const setting = await prisma.setting.findFirst({
      where: { key: `marcacion_config:${tenant.id}` },
      select: { value: true },
    });
    const config = parseMarcacionConfigValue(setting?.value);
    if (!config.alertaFaltaMarcacionEnabled) {
      skippedDisabled++;
      continue;
    }

    const rows = await prisma.opsAsistenciaDiaria.findMany({
      where: {
        tenantId: tenant.id,
        deletedAt: null,
        date: {
          gte: new Date(`${yesterdayYmd}T00:00:00.000Z`),
          lte: new Date(`${todayYmd}T00:00:00.000Z`),
        },
        OR: [{ plannedGuardiaId: { not: null } }, { replacementGuardiaId: { not: null } }],
      },
      select: {
        id: true,
        date: true,
        puestoId: true,
        slotNumber: true,
        attendanceStatus: true,
        plannedGuardiaId: true,
        replacementGuardiaId: true,
        plannedShiftStart: true,
        plannedShiftEnd: true,
        checkInAt: true,
        checkOutAt: true,
        marcacionEntradaId: true,
        marcacionSalidaId: true,
        installation: { select: { id: true, name: true } },
        puesto: { select: { shiftStart: true, shiftEnd: true } },
        plannedGuardia: {
          select: {
            id: true,
            isArticulo22: true,
            personalEmail: true,
            persona: {
              select: { firstName: true, lastName: true, rut: true, personalEmail: true, email: true },
            },
          },
        },
        replacementGuardia: {
          select: {
            id: true,
            isArticulo22: true,
            personalEmail: true,
            persona: {
              select: { firstName: true, lastName: true, rut: true, personalEmail: true, email: true },
            },
          },
        },
      },
    });

    const employerEmails = config.alertaFaltaMarcacionEmployerEmails;

    for (const row of rows) {
      if (SKIP_STATUS.has(row.attendanceStatus)) continue;
      const guardia =
        row.attendanceStatus === "reemplazo" && row.replacementGuardia
          ? row.replacementGuardia
          : row.plannedGuardia;
      if (!guardia || guardia.isArticulo22) continue;

      const ymd = ymdFromDbDate(row.date);
      const startStr = row.plannedShiftStart ?? row.puesto.shiftStart;
      const endStr = row.plannedShiftEnd ?? row.puesto.shiftEnd;
      if (!startStr || !endStr) continue;

      const startAt = chileDateTime(ymd, startStr);
      let endAt = chileDateTime(ymd, endStr);
      if (endAt.getTime() <= startAt.getTime()) {
        endAt = new Date(endAt.getTime() + 24 * 60 * 60 * 1000);
      }

      const cases: Array<{ tipo: "entrada" | "salida"; dueAt: Date; missing: boolean; horaPactada: string }> = [
        {
          tipo: "entrada",
          dueAt: new Date(startAt.getTime() + FALTA_ALERT_GRACE_MS),
          missing: !row.checkInAt && !row.marcacionEntradaId,
          horaPactada: startStr,
        },
        {
          tipo: "salida",
          dueAt: new Date(endAt.getTime() + FALTA_ALERT_GRACE_MS),
          missing: !row.checkOutAt && !row.marcacionSalidaId,
          horaPactada: endStr,
        },
      ];

      for (const c of cases) {
        if (!c.missing || !isFaltaAlertDue(now, c.dueAt)) continue;
        examined++;
        const turnoKey = row.id;
        const fecha = row.date;

        try {
          const existing = await prisma.opsMarcacionAlertaEnvio.findUnique({
            where: {
              tenantId_guardiaId_fecha_turnoKey_tipo: {
                tenantId: tenant.id,
                guardiaId: guardia.id,
                fecha,
                turnoKey,
                tipo: c.tipo,
              },
            },
            select: { id: true },
          });
          if (existing) {
            skippedAlready++;
            continue;
          }

          const name = formatPersonName(guardia.persona.firstName, guardia.persona.lastName);
          const email = resolvePersonalEmail({
            guardiaPersonalEmail: guardia.personalEmail,
            personaPersonalEmail: guardia.persona.personalEmail,
            personaEmail: guardia.persona.email,
          });

          await sendAlertaFaltaMarcacion({
            guardiaEmail: email,
            employerEmails,
            guardiaName: name,
            guardiaRut: guardia.persona.rut ?? "",
            installationName: row.installation.name,
            tipo: c.tipo,
            horaPactada: c.horaPactada,
            fecha: formatFechaComprobante(startAt),
          });

          await prisma.opsMarcacionAlertaEnvio.create({
            data: {
              tenantId: tenant.id,
              guardiaId: guardia.id,
              asistenciaId: row.id,
              fecha,
              turnoKey,
              tipo: c.tipo,
              status: email ? "sent" : "no_email",
            },
          });
          sent++;
        } catch (err) {
          errors++;
          console.error("[alerta-falta-marcacion] Error:", err);
        }
      }
    }
  }

  return { sent, skippedDisabled, skippedAlready, errors, examined };
}
