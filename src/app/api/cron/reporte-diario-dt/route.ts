/**
 * POST /api/cron/reporte-diario-dt
 * Art. 27 e — correo diario de marcaciones a cada tenant (no desactivable).
 * 23:30 hora Chile ≈ 02:30 UTC (verano).
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { todayInChile } from "@/lib/dates-cl";
import { buildReporteJornada } from "@/modules/reportes-dt/portal-reports";
import { sendDailyReportEmail } from "@/lib/fiscalizacion-dt/emails";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const MAX_ROWS_PER_MAIL = 200;

export async function POST(request: Request) {
  const cronSecret = request.headers.get("authorization")?.replace("Bearer ", "");
  if (cronSecret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const ymd = todayInChile();
  const tenants = await prisma.tenant.findMany({
    where: { active: true, dtContractEnd: null },
    select: { id: true, name: true, legalName: true, dtDailyReportEmail: true },
  });

  let sent = 0;
  let skipped = 0;
  let errors = 0;

  for (const tenant of tenants) {
    const to = tenant.dtDailyReportEmail?.trim();
    if (!to) {
      skipped += 1;
      console.warn(`[FISCALIZACION-DT] reporte-diario sin destinatario tenant=${tenant.id}`);
      continue;
    }

    try {
      const report = await buildReporteJornada(tenant.id, { from: ymd, to: ymd, periodo: null });
      const employerName = tenant.legalName || tenant.name;
      const byInst = new Map<
        string,
        { trabajador: string; rut: string; entrada: string; salida: string; observaciones: string }[]
      >();
      for (const w of report.workers) {
        const inst = w.installationName || "Sin instalación";
        const list = byInst.get(inst) ?? [];
        if (w.rows.length === 0) {
          list.push({
            trabajador: w.workerName,
            rut: w.workerRut,
            entrada: "",
            salida: "",
            observaciones: w.emptyMessage || "",
          });
        } else {
          for (const row of w.rows) {
            list.push({
              trabajador: w.workerName,
              rut: w.workerRut,
              entrada: String(row.marcacionesJornada ?? ""),
              salida: "",
              observaciones: String(row.observaciones ?? ""),
            });
          }
        }
        byInst.set(inst, list);
      }

      const allRows = [...byInst.values()].flat();
      if (allRows.length <= MAX_ROWS_PER_MAIL) {
        const result = await sendDailyReportEmail(to, { employerName, ymd, rows: allRows });
        if (result.ok) sent += 1;
        else errors += 1;
      } else {
        for (const [inst, rows] of byInst) {
          const result = await sendDailyReportEmail(to, {
            employerName,
            ymd,
            installationName: inst,
            rows,
          });
          if (result.ok) sent += 1;
          else errors += 1;
        }
      }
    } catch (error) {
      errors += 1;
      console.error(`[FISCALIZACION-DT] reporte-diario tenant=${tenant.id}`, error);
    }
  }

  return NextResponse.json({ success: true, ymd, sent, skipped, errors, tenants: tenants.length });
}
