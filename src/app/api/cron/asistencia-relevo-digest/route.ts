/**
 * API Route: /api/cron/asistencia-relevo-digest
 * GET - Publica el tablero de relevo (control de asistencia) con anticipación.
 *
 * Corre CADA HORA. Para cada tenant con workspace Slack, lee `Setting
 * relevo_config` (default {anticipacionMin:60, enabled:true}) y, para cada
 * (instalación, turno entrante) cuyos puestos activos arrancan a `shiftStart`,
 * publica el tablero cuando la hora Chile coincide con `shiftStart −
 * anticipacionMin` (redondeo a la hora del cron). Idempotente por el unique de
 * OpsRelevoSlackBoard (publishRelevoBoard re-edita si ya existe OPEN).
 * Protegido con CRON_SECRET.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getWorkspaceForTenant } from "@/lib/integrations/slack/workspace";
import { publishRelevoBoard } from "@/lib/ops/relevo-board";
import { ensureAsistenciaDia } from "@/lib/ops/ensure-asistencia-dia";
import { chileDayStart } from "@/lib/marcacion-jornada";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface RelevoConfig {
  anticipacionMin: number;
  enabled: boolean;
}

const DEFAULT_CONFIG: RelevoConfig = { anticipacionMin: 60, enabled: true };

/** Hora del cron (0-23) en que debe publicarse el tablero de un `shiftStart`. */
function publishHourFor(shiftStart: string, anticipacionMin: number): number | null {
  const [hh, mm] = shiftStart.split(":").map(Number);
  if (!Number.isFinite(hh)) return null;
  const shiftMin = hh * 60 + (Number.isFinite(mm) ? mm : 0);
  const pub = (((shiftMin - anticipacionMin) % 1440) + 1440) % 1440;
  return Math.floor(pub / 60);
}

/**
 * Fecha (día Chile, medianoche UTC como la pauta) en que ENTRA el turno.
 *
 * Caso normal (07-08, 19-20): la publicación y la entrada ocurren el mismo día
 * Chile → `chileDayStart(now)`. Caso borde: si `shiftStart − anticipacionMin`
 * es negativo, la publicación cayó el día ANTERIOR a la entrada (turno de
 * madrugada publicado antes de medianoche) → el turno entra al día siguiente.
 * La pauta cambia día a día, así que la fecha del tablero debe ser la del turno
 * que entra, no la del día de publicación.
 */
function shiftDateFor(now: Date, shiftStart: string, anticipacionMin: number): Date {
  const base = chileDayStart(now);
  const [hh, mm] = shiftStart.split(":").map(Number);
  if (!Number.isFinite(hh)) return base;
  const shiftMin = hh * 60 + (Number.isFinite(mm) ? mm : 0);
  if (shiftMin - anticipacionMin < 0) {
    // base es medianoche UTC del día calendario; +24h da la medianoche UTC del
    // día siguiente (mismo formato @db.Date que la pauta, sin desfase por DST).
    return new Date(base.getTime() + 24 * 60 * 60 * 1000);
  }
  return base;
}

async function getRelevoConfig(tenantId: string): Promise<RelevoConfig> {
  const setting = await prisma.setting.findFirst({
    where: { key: "relevo_config", tenantId },
    select: { value: true },
  });
  if (!setting?.value) return DEFAULT_CONFIG;
  try {
    const parsed = JSON.parse(setting.value) as Partial<RelevoConfig>;
    return {
      anticipacionMin: typeof parsed.anticipacionMin === "number" ? parsed.anticipacionMin : DEFAULT_CONFIG.anticipacionMin,
      enabled: parsed.enabled !== false,
    };
  } catch {
    return DEFAULT_CONFIG;
  }
}

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret && process.env.NODE_ENV === "production") {
    return NextResponse.json({ success: false, error: "CRON_SECRET not configured" }, { status: 500 });
  }
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const chileHour = Number(
    new Intl.DateTimeFormat("en-US", { timeZone: "America/Santiago", hour: "numeric", hour12: false }).format(now),
  );
  try {
    const tenants = await prisma.tenant.findMany({ where: { active: true }, select: { id: true } });
    let published = 0;
    let skipped = 0;
    let errors = 0;

    for (const tenant of tenants) {
      try {
        const config = await getRelevoConfig(tenant.id);
        if (!config.enabled) {
          skipped++;
          continue;
        }
        const workspace = await getWorkspaceForTenant(tenant.id);
        if (!workspace) {
          skipped++;
          continue;
        }

        const puestos = await prisma.opsPuestoOperativo.findMany({
          where: { tenantId: tenant.id, active: true },
          select: { installationId: true, shiftStart: true },
        });

        // Pares únicos (instalación, turno) que arrancan esta franja.
        const seen = new Set<string>();
        for (const p of puestos) {
          if (publishHourFor(p.shiftStart, config.anticipacionMin) !== chileHour) continue;
          const key = `${p.installationId}|${p.shiftStart}`;
          if (seen.has(key)) continue;
          seen.add(key);
          // try/catch por instalación: un fallo aislado no corta el resto.
          try {
            const targetDate = shiftDateFor(now, p.shiftStart, config.anticipacionMin);
            // Materializa la asistencia del DÍA DEL TURNO antes de publicar: el
            // tablero lee OpsAsistenciaDiaria, que no se genera sola si nadie
            // abrió la vista de asistencia ese día. Idempotente (skipDuplicates).
            await ensureAsistenciaDia({
              tenantId: tenant.id,
              installationId: p.installationId,
              date: targetDate,
            });
            // publishRelevoBoard no-op si no hay puente Slack para la instalación.
            await publishRelevoBoard({
              tenantId: tenant.id,
              installationId: p.installationId,
              date: targetDate,
              shiftStart: p.shiftStart,
            });
            published++;
          } catch (err) {
            errors++;
            console.error(
              `[asistencia-relevo-digest] Error publicando tablero instalación ${p.installationId} turno ${p.shiftStart}:`,
              err,
            );
          }
        }
      } catch (err) {
        errors++;
        console.error(`[asistencia-relevo-digest] Error for tenant ${tenant.id}:`, err);
      }
    }

    return NextResponse.json({ success: true, tenants: tenants.length, chileHour, published, skipped, errors });
  } catch (error) {
    console.error("[asistencia-relevo-digest] Fatal error:", error);
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}
