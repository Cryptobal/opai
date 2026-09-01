/**
 * Art. 41 c — modificaciones, agregados y eliminaciones de marcas
 * solo desde el día hábil siguiente a la fecha de la marca (TZ Chile).
 */

import { prisma } from "@/lib/prisma";
import { ymdInChile } from "@/lib/dates-cl";
import { nextBusinessDay } from "@/lib/business-days";

export const ART_41C_ERROR =
  "Las modificaciones, agregados o eliminaciones de marcaciones solo se aceptan desde el día hábil siguiente a la fecha de la marca (Res. Exenta N°38 Art. 41 c).";

export async function loadTenantHolidayYmds(
  tenantId: string,
  years: number[],
): Promise<Set<string>> {
  const uniqueYears = Array.from(new Set(years));
  const rows = await prisma.payrollHoliday.findMany({
    where: { tenantId, year: { in: uniqueYears }, isActive: true },
    select: { date: true },
  });
  return new Set(rows.map((r) => ymdInChile(r.date)));
}

/**
 * true si `now` es un día hábil igual o posterior al día hábil siguiente
 * de la fecha de la marca (calendario Chile).
 */
export function isMarcacionBackOfficeWindowOpen(
  markInstant: Date,
  now: Date = new Date(),
  holidays?: ReadonlySet<string>,
): boolean {
  const markYmd = ymdInChile(markInstant);
  const [y, m, d] = markYmd.split("-").map(Number);
  const markDate = new Date(y, m - 1, d);
  const earliest = nextBusinessDay(markDate, holidays);
  const todayYmd = ymdInChile(now);
  const earliestYmd = `${earliest.getFullYear()}-${String(earliest.getMonth() + 1).padStart(2, "0")}-${String(earliest.getDate()).padStart(2, "0")}`;
  return todayYmd >= earliestYmd;
}

export async function assertMarcacionBackOfficeWindow(params: {
  tenantId: string;
  markInstant: Date;
  now?: Date;
}): Promise<{ ok: true } | { ok: false; error: string; status: 422 }> {
  const now = params.now ?? new Date();
  const markYear = Number(ymdInChile(params.markInstant).slice(0, 4));
  const nowYear = Number(ymdInChile(now).slice(0, 4));
  const holidays = await loadTenantHolidayYmds(params.tenantId, [markYear, nowYear]);
  if (isMarcacionBackOfficeWindowOpen(params.markInstant, now, holidays)) {
    return { ok: true };
  }
  return { ok: false, error: ART_41C_ERROR, status: 422 };
}
