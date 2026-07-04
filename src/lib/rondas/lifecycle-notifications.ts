/**
 * Eventos de ciclo de vida de rondas hacia el catálogo unificado (Fase 19).
 *
 * La ronda "habla" en tres momentos: al iniciar (`ronda_started`), al terminar
 * (`ronda_completed` — también en sus variantes de falla `incompleta` /
 * `cerrada_auto`, con tarjeta ⚠️) y cuando nunca se inició (`ronda_overdue_admin`
 * desde el cron cerrar-atrasadas). En Slack, `ronda_started` funda el hilo de la
 * ronda y los términos llegan como reply (ver integrations/slack/dispatch.ts).
 *
 * Decisión de catálogo: las fallas de una ronda que SÍ corrió usan el mismo tipo
 * `ronda_completed` con variante visual (título ⚠️ + Motivo), no un tipo nuevo
 * `ronda_failed` — mantiene una sola preferencia/ruta por "término de ronda" y
 * simplifica el threading (todo término es el mismo evento).
 *
 * Todas las funciones son fire-and-forget-safe: nunca lanzan. Los emisores se
 * cuelgan de los endpoints con `after()` para no bloquear la respuesta.
 */

import { prisma } from "@/lib/prisma";
import { notify } from "@/lib/notifications/notify";
import { formatPersonName } from "@/lib/personas";
import { formatChileTime } from "@/lib/rondas/timezone";
import { getRondasNotifPolicy } from "@/lib/rondas/notification-policy";

/**
 * Deep link al recorrido de UNA ejecución: la página de reportes abre el modal
 * de auditoría (mapa + checkpoints) cuando recibe `ejecucionId` (Fase 19).
 */
export function rondaRecorridoLink(ejecucionId: string): string {
  return `/ops/rondas/reportes?ejecucionId=${ejecucionId}`;
}

type EjecucionInfo = {
  id: string;
  tenantId: string;
  status: string;
  isAdHoc: boolean;
  scheduledAt: Date;
  startedAt: Date | null;
  completedAt: Date | null;
  checkpointsTotal: number;
  checkpointsCompletados: number;
  porcentajeCompletado: number;
  durationMinutes: number | null;
  penalizacionMotivo: string | null;
  rondaTemplate: { name: string; installation: { name: string } | null } | null;
  installation: { name: string } | null;
  guardia: { persona: { firstName: string; lastName: string } } | null;
};

async function loadEjecuciones(tenantId: string, ids: string[]): Promise<EjecucionInfo[]> {
  if (ids.length === 0) return [];
  return prisma.opsRondaEjecucion.findMany({
    where: { id: { in: ids }, tenantId },
    select: {
      id: true,
      tenantId: true,
      status: true,
      isAdHoc: true,
      scheduledAt: true,
      startedAt: true,
      completedAt: true,
      checkpointsTotal: true,
      checkpointsCompletados: true,
      porcentajeCompletado: true,
      durationMinutes: true,
      penalizacionMotivo: true,
      rondaTemplate: { select: { name: true, installation: { select: { name: true } } } },
      installation: { select: { name: true } },
      guardia: { select: { persona: { select: { firstName: true, lastName: true } } } },
    },
  });
}

function rondaName(ej: EjecucionInfo): string {
  return ej.rondaTemplate?.name ?? (ej.isAdHoc ? "Ronda libre" : "Ronda");
}

function installationName(ej: EjecucionInfo): string {
  return ej.rondaTemplate?.installation?.name ?? ej.installation?.name ?? "Sin instalación";
}

function guardiaName(ej: EjecucionInfo): string | null {
  return ej.guardia
    ? formatPersonName(ej.guardia.persona.firstName, ej.guardia.persona.lastName)
    : null;
}

/** Campos base de la tarjeta (labels ya legibles: el renderer los muestra tal cual). */
function baseData(ej: EjecucionInfo): Record<string, unknown> {
  const guardia = guardiaName(ej);
  return {
    rondaId: ej.id,
    Ronda: rondaName(ej),
    "Instalación": installationName(ej),
    ...(guardia ? { Guardia: guardia } : {}),
  };
}

function durationLabel(ej: EjecucionInfo): string | null {
  const mins =
    ej.durationMinutes ??
    (ej.startedAt && ej.completedAt
      ? Math.round((ej.completedAt.getTime() - ej.startedAt.getTime()) / 60000)
      : null);
  return mins != null ? `${mins} min` : null;
}

/**
 * `ronda_started`: la tarjeta que funda el hilo de la ronda en Slack.
 * Respeta `rondaStartedEnabled` (Setting `rondas_notif_policy`) — si el tenant
 * lo apaga, la ronda solo habla al terminar (tarjeta suelta, sin hilo).
 */
export async function emitRondaStarted(tenantId: string, ejecucionId: string): Promise<void> {
  try {
    const policy = await getRondasNotifPolicy(tenantId);
    if (!policy.rondaStartedEnabled) return;

    const [ej] = await loadEjecuciones(tenantId, [ejecucionId]);
    if (!ej) return;

    await notify({
      tenantId,
      type: "ronda_started",
      title: "🛡️ Ronda iniciada",
      data: {
        ...baseData(ej),
        // Programada vs real: solo para rondas programadas (ad-hoc parten "ya").
        ...(ej.isAdHoc ? {} : { Programada: formatChileTime(ej.scheduledAt) }),
        ...(ej.startedAt ? { Inicio: formatChileTime(ej.startedAt) } : {}),
      },
      link: rondaRecorridoLink(ej.id),
    });
  } catch (err) {
    console.error("[rondas] emitRondaStarted error:", err);
  }
}

/**
 * `ronda_completed`: término de una ronda que corrió — ✅ si `completada`,
 * ⚠️ si `incompleta` o `cerrada_auto`/`cerrada_admin` (variante de falla).
 * En Slack cae como reply del hilo y actualiza la raíz (Fase 19 B2); el
 * `resumen` del data es la línea que la raíz muestra tras el "→".
 */
export async function emitRondaTerminada(tenantId: string, ejecucionId: string): Promise<void> {
  try {
    const [ej] = await loadEjecuciones(tenantId, [ejecucionId]);
    if (!ej) return;

    const checkpoints = `${ej.checkpointsCompletados}/${ej.checkpointsTotal}`;
    const avance = `${Math.round(ej.porcentajeCompletado)}%`;
    const dur = durationLabel(ej);

    let title: string;
    let resumen: string;
    let motivo: string | null = null;
    switch (ej.status) {
      case "completada":
        title = "✅ Ronda completada";
        resumen = `✅ ${checkpoints} checkpoints${dur ? ` en ${dur}` : ""}`;
        break;
      case "incompleta":
        title = "⚠️ Ronda incompleta";
        resumen = `⚠️ Incompleta · ${checkpoints} (${avance})`;
        motivo = "Más del 20% de los checkpoints sin marcar";
        break;
      case "cerrada_auto":
        title = "⚠️ Ronda cerrada auto";
        resumen = `⚠️ Cierre automático · ${avance} logrado`;
        motivo = ej.penalizacionMotivo ?? "Cierre automático del sistema";
        break;
      case "cerrada_admin":
        title = "⚠️ Ronda cerrada admin";
        resumen = `⚠️ Cerrada por admin · ${avance} logrado`;
        motivo = "Cerrada manualmente por un administrador";
        break;
      default:
        return; // estado no terminal: nada que anunciar
    }

    await notify({
      tenantId,
      type: "ronda_completed",
      title,
      body: resumen,
      data: {
        ...baseData(ej),
        resumen,
        Checkpoints: checkpoints,
        Avance: avance,
        ...(dur ? { "Duración": dur } : {}),
        ...(motivo ? { Motivo: motivo } : {}),
      },
      link: rondaRecorridoLink(ej.id),
    });
  } catch (err) {
    console.error("[rondas] emitRondaTerminada error:", err);
  }
}

/**
 * `ronda_overdue_admin`: la ronda nunca se inició y el cron la cerró como
 * `no_realizada`. Tarjeta individual de atención (bell + push a admins según
 * defaults del catálogo). Batch: el cron cierra en lote.
 */
export async function emitRondasNoRealizadas(tenantId: string, ejecucionIds: string[]): Promise<void> {
  try {
    const ejecuciones = await loadEjecuciones(tenantId, ejecucionIds);
    for (const ej of ejecuciones) {
      await notify({
        tenantId,
        type: "ronda_overdue_admin",
        title: "🚨 Ronda no realizada",
        body: `La ronda de las ${formatChileTime(ej.scheduledAt)} no fue iniciada dentro de su ventana de tolerancia.`,
        data: {
          ...baseData(ej),
          resumen: "🚨 No realizada · 0%",
          Programada: formatChileTime(ej.scheduledAt),
        },
        link: rondaRecorridoLink(ej.id),
      }).catch((err) => console.error("[rondas] emitRondasNoRealizadas notify error:", err));
    }
  } catch (err) {
    console.error("[rondas] emitRondasNoRealizadas error:", err);
  }
}

/** Variante batch de término para los crons de cierre automático. */
export async function emitRondasTerminadas(tenantId: string, ejecucionIds: string[]): Promise<void> {
  for (const id of ejecucionIds) {
    await emitRondaTerminada(tenantId, id);
  }
}
