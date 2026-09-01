/**
 * Verificación de desfase vs Hora Oficial de Chile (HTTPS).
 * Res. Ex. N°38 Art. 11 — las funciones de Vercel no permiten NTP/UDP.
 */

import { prisma } from "@/lib/prisma";
import { resend } from "@/lib/resend";
import { PLATFORM_DEFAULT_EMAIL_FROM } from "@/lib/platform-email";
import { getAppVersion } from "@/lib/app-version";
import {
  classifyDrift,
  driftWithRttCompensation,
  shouldDiscardRtt,
  shouldNotifyDriftAlert,
  TIME_SYNC_FETCH_TIMEOUT_MS,
  TIME_SYNC_INCIDENT_PREFIX,
  TIME_SYNC_RETENTION_YEARS,
  type TimeSyncSource,
  type TimeSyncStatus,
} from "./classify";
import { parseCloudflareTraceTs, parseHttpDate } from "./parse";

const SHOA_URL = "https://www.horaoficial.cl/";
const CLOUDFLARE_TRACE_URL = "https://www.cloudflare.com/cdn-cgi/trace";

export type TimeSyncCheckResult = {
  checkedAt: Date;
  referenceSource: TimeSyncSource;
  referenceTime: Date | null;
  serverTime: Date;
  rttMs: number | null;
  driftMs: number | null;
  status: TimeSyncStatus;
  softwareVersion: string;
};

async function fetchWithTimeout(url: string, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIME_SYNC_FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
      cache: "no-store",
      redirect: "follow",
    });
  } finally {
    clearTimeout(timer);
  }
}

async function probeShoa(): Promise<{ referenceTime: Date; rttMs: number; t0: number; t1: number } | null> {
  const attempt = async (method: "HEAD" | "GET") => {
    const t0 = Date.now();
    const res = await fetchWithTimeout(SHOA_URL, { method });
    const t1 = Date.now();
    const date = parseHttpDate(res.headers.get("date"));
    if (!date) return null;
    return { referenceTime: date, rttMs: t1 - t0, t0, t1 };
  };

  try {
    const head = await attempt("HEAD");
    if (head && !shouldDiscardRtt(head.rttMs)) return head;
  } catch (err) {
    console.warn("[time-sync] SHOA HEAD falló", err);
  }

  try {
    return await attempt("GET");
  } catch (err) {
    console.warn("[time-sync] SHOA GET falló", err);
    return null;
  }
}

async function probeCloudflare(): Promise<{ referenceTime: Date; rttMs: number; t0: number; t1: number } | null> {
  const t0 = Date.now();
  const res = await fetchWithTimeout(CLOUDFLARE_TRACE_URL, { method: "GET" });
  const t1 = Date.now();
  const body = await res.text();
  const referenceTime = parseCloudflareTraceTs(body);
  if (!referenceTime) return null;
  return { referenceTime, rttMs: t1 - t0, t0, t1 };
}

async function measureOnce(): Promise<{
  source: TimeSyncSource;
  referenceTime: Date | null;
  t0: number;
  t1: number;
  rttMs: number | null;
  driftMs: number | null;
}> {
  try {
    const shoa = await probeShoa();
    if (shoa && !shouldDiscardRtt(shoa.rttMs)) {
      const { driftMs, rttMs } = driftWithRttCompensation(
        shoa.t0,
        shoa.t1,
        shoa.referenceTime.getTime(),
      );
      return {
        source: "shoa",
        referenceTime: shoa.referenceTime,
        t0: shoa.t0,
        t1: shoa.t1,
        rttMs,
        driftMs,
      };
    }
  } catch (err) {
    console.warn("[time-sync] SHOA no disponible", err);
  }

  try {
    const cf = await probeCloudflare();
    if (cf && !shouldDiscardRtt(cf.rttMs)) {
      const { driftMs, rttMs } = driftWithRttCompensation(
        cf.t0,
        cf.t1,
        cf.referenceTime.getTime(),
      );
      return {
        source: "cloudflare",
        referenceTime: cf.referenceTime,
        t0: cf.t0,
        t1: cf.t1,
        rttMs,
        driftMs,
      };
    }
  } catch (err) {
    console.warn("[time-sync] Cloudflare trace no disponible", err);
  }

  const now = Date.now();
  return {
    source: "none",
    referenceTime: null,
    t0: now,
    t1: now,
    rttMs: null,
    driftMs: null,
  };
}

async function resolvePlatformAlertEmails(): Promise<string[]> {
  const admins = await prisma.platformAdmin.findMany({
    where: { status: "active" },
    select: { email: true },
  });
  const extra = (process.env.PLATFORM_ALERTS_EMAIL ?? "").trim().toLowerCase();
  return Array.from(
    new Set(
      [...admins.map((a) => a.email), extra]
        .map((e) => e.trim().toLowerCase())
        .filter(Boolean),
    ),
  );
}

async function sendDriftAlert(result: TimeSyncCheckResult): Promise<boolean> {
  const to = await resolvePlatformAlertEmails();
  if (to.length === 0) return false;
  const driftSec = result.driftMs == null ? "n/d" : `${Math.round(result.driftMs / 1000)} s`;
  const response = await resend.emails.send({
    from: PLATFORM_DEFAULT_EMAIL_FROM,
    to,
    subject: `Alerta de desfase horario — ${driftSec} (${result.referenceSource})`,
    html: `<p>El desfase del servidor respecto de la referencia horaria superó 5 minutos.</p>
<p>Fuente: ${result.referenceSource}<br/>
Desfase: ${result.driftMs ?? "n/d"} ms<br/>
Hora servidor (UTC): ${result.serverTime.toISOString()}<br/>
Hora referencia (UTC): ${result.referenceTime?.toISOString() ?? "n/d"}<br/>
Versión: ${result.softwareVersion}</p>
<p>Ver bitácora: /platform/sincronizacion-horaria</p>`,
  });
  if (response.error) {
    throw new Error(response.error.message);
  }
  return true;
}

async function maybeOpenIncident(): Promise<void> {
  const last = await prisma.opsTimeSyncLog.findMany({
    orderBy: { checkedAt: "desc" },
    take: 3,
    select: { status: true },
  });
  if (last.length < 3 || last.some((row) => row.status !== "alert")) return;

  const open = await prisma.dtIncidenteTecnico.findFirst({
    where: {
      tenantId: null,
      endedAt: null,
      description: { startsWith: TIME_SYNC_INCIDENT_PREFIX },
    },
    select: { id: true },
  });
  if (open) return;

  await prisma.dtIncidenteTecnico.create({
    data: {
      tenantId: null,
      startedAt: new Date(),
      description: `${TIME_SYNC_INCIDENT_PREFIX}: tres verificaciones consecutivas con desfase > 5 minutos.`,
      severity: "parcial",
      createdBy: "cron:time-sync-check",
    },
  });
}

async function closeOpenIncident(): Promise<void> {
  await prisma.dtIncidenteTecnico.updateMany({
    where: {
      tenantId: null,
      endedAt: null,
      description: { startsWith: TIME_SYNC_INCIDENT_PREFIX },
    },
    data: { endedAt: new Date() },
  });
}

export async function runTimeSyncCheck(): Promise<TimeSyncCheckResult> {
  let measured = await measureOnce();
  if (measured.rttMs != null && shouldDiscardRtt(measured.rttMs)) {
    measured = await measureOnce();
  }
  if (measured.rttMs != null && shouldDiscardRtt(measured.rttMs)) {
    measured = {
      source: "none",
      referenceTime: null,
      t0: Date.now(),
      t1: Date.now(),
      rttMs: null,
      driftMs: null,
    };
  }

  const serverTime = new Date(measured.t1);
  const status = classifyDrift(measured.driftMs, measured.source !== "none");
  const result: TimeSyncCheckResult = {
    checkedAt: serverTime,
    referenceSource: measured.source,
    referenceTime: measured.referenceTime,
    serverTime,
    rttMs: measured.rttMs,
    driftMs: measured.driftMs,
    status,
    softwareVersion: getAppVersion(),
  };

  const created = await prisma.opsTimeSyncLog.create({
    data: {
      checkedAt: result.checkedAt,
      referenceSource: result.referenceSource,
      referenceTime: result.referenceTime,
      serverTime: result.serverTime,
      rttMs: result.rttMs,
      driftMs: result.driftMs,
      status: result.status,
    },
  });

  const cutoff = new Date();
  cutoff.setFullYear(cutoff.getFullYear() - TIME_SYNC_RETENTION_YEARS);
  await prisma.opsTimeSyncLog.deleteMany({ where: { checkedAt: { lt: cutoff } } });

  if (status === "alert") {
    const [lastNotified, lastOk] = await Promise.all([
      prisma.opsTimeSyncLog.findFirst({
        where: { notifiedAt: { not: null } },
        orderBy: { checkedAt: "desc" },
        select: { checkedAt: true },
      }),
      prisma.opsTimeSyncLog.findFirst({
        where: { status: "ok" },
        orderBy: { checkedAt: "desc" },
        select: { checkedAt: true },
      }),
    ]);
    if (
      shouldNotifyDriftAlert({
        status,
        lastNotifiedCheckedAt: lastNotified?.checkedAt ?? null,
        lastOkCheckedAt: lastOk?.checkedAt ?? null,
      })
    ) {
      try {
        const sent = await sendDriftAlert(result);
        if (sent) {
          await prisma.opsTimeSyncLog.update({
            where: { id: created.id },
            data: { notifiedAt: new Date() },
          });
        }
      } catch (err) {
        console.error("[time-sync] Error enviando alerta", err);
      }
    }
    await maybeOpenIncident();
  } else if (status === "ok") {
    await closeOpenIncident();
  }

  return result;
}
