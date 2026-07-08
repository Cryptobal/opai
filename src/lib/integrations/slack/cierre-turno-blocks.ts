/**
 * Tarjeta "🏁 Cierre de turno · Rondas": resumen del control al cerrar el turno
 * de monitoreo (mismo momento que `sendMonitorTurnoEmail`). KPI row + semáforo
 * por instalación. Se publica al canal del módulo ops (el que recibe los correos).
 */

import { getCanonicalSiteUrl } from "@/lib/emails/site-url";

const pt = (text: string) => ({ type: "plain_text", text: text.slice(0, 150), emoji: true });
const CHILE_TZ = "America/Santiago";

export interface CierreTurnoInput {
  operatorName: string;
  startedAt: Date;
  endedAt: Date;
  completadas: number;
  incompletas: number;
  noRealizadas: number;
  trustAvg: number;
  criticalAlerts: number;
  installationSummaries?: Array<{ name: string; completadas: number; totalRondas: number; cumplimiento: number }> | null;
  semaforo?: Array<{ instalacion: string; nivel: string; razon: string }> | null;
  panicos?: unknown[] | null;
  reportUrl?: string;
}

function hora(d: Date): string {
  try {
    return new Intl.DateTimeFormat("es-CL", { timeZone: CHILE_TZ, day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).format(d);
  } catch {
    return d.toISOString();
  }
}

function nivelEmoji(nivel: string): string {
  return nivel === "rojo" ? "🔴" : nivel === "amarillo" ? "🟡" : "🟢";
}

export function buildCierreTurnoBlocks(input: CierreTurnoInput): { text: string; blocks: unknown[] } {
  const panicoCount = Array.isArray(input.panicos) ? input.panicos.length : 0;
  const fields = [
    { label: "Completadas", value: `${input.completadas}` },
    { label: "Incompletas", value: `${input.incompletas}` },
    { label: "No realizadas", value: `${input.noRealizadas}` },
    { label: "Confianza prom.", value: `${input.trustAvg}%` },
    { label: "Alertas críticas", value: `${input.criticalAlerts}` },
    { label: "Pánicos", value: `${panicoCount}` },
  ];

  const blocks: unknown[] = [
    { type: "header", text: pt("🏁 Cierre de turno · Rondas") },
    {
      type: "context",
      elements: [{ type: "mrkdwn", text: `Operador *${input.operatorName}* · ${hora(input.startedAt)} → ${hora(input.endedAt)}` }],
    },
    {
      type: "section",
      fields: fields.map((f) => ({ type: "mrkdwn", text: `*${f.label}*\n${f.value}` })),
    },
  ];

  const semaforo = (input.semaforo ?? []).slice(0, 10);
  if (semaforo.length) {
    blocks.push({ type: "divider" });
    blocks.push({ type: "section", text: { type: "mrkdwn", text: "*Semáforo por instalación*" } });
    blocks.push({
      type: "section",
      text: { type: "mrkdwn", text: semaforo.map((s) => `${nivelEmoji(s.nivel)} *${s.instalacion}* — ${s.razon}`).join("\n") },
    });
  }

  blocks.push({ type: "context", elements: [{ type: "mrkdwn", text: "Enviado al cerrar el control · Operaciones · OPAI" }] });
  const reportUrl = input.reportUrl ?? `${getCanonicalSiteUrl()}/ops/rondas/reportes`;
  blocks.push({
    type: "actions",
    elements: [{ type: "button", action_id: "cierre_ver_reporte", text: pt("Ver reporte"), url: reportUrl, style: "primary" }],
  });

  const text = `🏁 Cierre de turno · Rondas — ${input.completadas} completadas, ${input.noRealizadas} no realizadas, ${input.criticalAlerts} alertas críticas`;
  return { text, blocks };
}
