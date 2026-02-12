import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { chromium } from "playwright-core";
import chromiumPkg from "@sparticuz/chromium";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { ensureOpsAccess, getMonthDateRange } from "@/lib/ops";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type ExecutionState = "asistio" | "te" | "sin_cobertura" | "ppc";

const WEEKDAY_SHORT: Record<number, string> = {
  0: "Dom",
  1: "Lun",
  2: "Mar",
  3: "Mié",
  4: "Jue",
  5: "Vie",
  6: "Sáb",
};

const MESES = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
];

function toDateKey(date: Date | string): string {
  if (typeof date === "string") return date.slice(0, 10);
  return date.toISOString().slice(0, 10);
}

function daysInMonth(year: number, month: number): Date[] {
  const days: Date[] = [];
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  for (let d = 1; d <= last; d += 1) days.push(new Date(Date.UTC(year, month - 1, d)));
  return days;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export async function GET(request: NextRequest) {
  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;

  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = ensureOpsAccess(ctx);
    if (forbidden) return forbidden;

    const installationId = request.nextUrl.searchParams.get("installationId") || undefined;
    const month = Number(request.nextUrl.searchParams.get("month") || new Date().getUTCMonth() + 1);
    const year = Number(request.nextUrl.searchParams.get("year") || new Date().getUTCFullYear());
    if (!installationId) {
      return NextResponse.json(
        { success: false, error: "installationId es requerido" },
        { status: 400 }
      );
    }

    const { start, end } = getMonthDateRange(year, month);
    const [installation, pauta, asignaciones, asistencia] = await Promise.all([
      prisma.crmInstallation.findFirst({
        where: { id: installationId, tenantId: ctx.tenantId },
        select: {
          id: true,
          name: true,
          account: { select: { name: true } },
        },
      }),
      prisma.opsPautaMensual.findMany({
        where: {
          tenantId: ctx.tenantId,
          installationId,
          date: { gte: start, lte: end },
        },
        include: {
          puesto: {
            select: {
              id: true,
              name: true,
              shiftStart: true,
              shiftEnd: true,
            },
          },
        },
        orderBy: [{ puestoId: "asc" }, { slotNumber: "asc" }, { date: "asc" }],
      }),
      prisma.opsAsignacionGuardia.findMany({
        where: {
          tenantId: ctx.tenantId,
          installationId,
          isActive: true,
        },
        select: {
          puestoId: true,
          slotNumber: true,
          guardia: {
            select: { persona: { select: { firstName: true, lastName: true } } },
          },
        },
      }),
      prisma.opsAsistenciaDiaria.findMany({
        where: {
          tenantId: ctx.tenantId,
          installationId,
          date: { gte: start, lte: end },
        },
        select: {
          puestoId: true,
          slotNumber: true,
          date: true,
          attendanceStatus: true,
          replacementGuardiaId: true,
        },
      }),
    ]);

    if (!installation) {
      return NextResponse.json(
        { success: false, error: "Instalación no encontrada" },
        { status: 404 }
      );
    }

    const executionByCell: Record<string, ExecutionState> = {};
    for (const row of asistencia) {
      const key = `${row.puestoId}|${row.slotNumber}|${toDateKey(row.date)}`;
      if (row.attendanceStatus === "reemplazo" && row.replacementGuardiaId) {
        executionByCell[key] = "te";
      } else if (row.attendanceStatus === "asistio") {
        executionByCell[key] = "asistio";
      } else if (row.attendanceStatus === "no_asistio") {
        executionByCell[key] = "sin_cobertura";
      } else if (row.attendanceStatus === "ppc") {
        executionByCell[key] = "ppc";
      }
    }

    const rows = new Map<
      string,
      {
        puestoId: string;
        puestoName: string;
        shiftStart: string;
        shiftEnd: string;
        slotNumber: number;
        guardiaName?: string;
        cells: Map<string, string>;
      }
    >();

    for (const item of pauta) {
      const key = `${item.puestoId}|${item.slotNumber}`;
      if (!rows.has(key)) {
        rows.set(key, {
          puestoId: item.puestoId,
          puestoName: item.puesto.name,
          shiftStart: item.puesto.shiftStart,
          shiftEnd: item.puesto.shiftEnd,
          slotNumber: item.slotNumber,
          cells: new Map(),
        });
      }
      rows.get(key)?.cells.set(toDateKey(item.date), item.shiftCode || "");
    }

    for (const a of asignaciones) {
      const key = `${a.puestoId}|${a.slotNumber}`;
      const row = rows.get(key);
      if (row) row.guardiaName = `${a.guardia.persona.firstName} ${a.guardia.persona.lastName}`;
    }

    const matrix = Array.from(rows.values()).sort((a, b) => {
      if (a.puestoName !== b.puestoName) return a.puestoName.localeCompare(b.puestoName);
      return a.slotNumber - b.slotNumber;
    });
    const monthDays = daysInMonth(year, month);

    const logoSvgPath = path.join(process.cwd(), "public", "logo-gard.svg");
    const logoSvg = await readFile(logoSvgPath, "utf-8");
    const logoDataUrl = `data:image/svg+xml;base64,${Buffer.from(logoSvg).toString("base64")}`;

    const shiftClass = (code: string) => {
      if (code === "T") return "shift-t";
      if (code === "-") return "shift-d";
      if (code === "V") return "shift-v";
      if (code === "L") return "shift-l";
      if (code === "P") return "shift-p";
      return "shift-empty";
    };

    const execBadge = (state?: ExecutionState) => {
      if (state === "asistio") return `<span class="badge badge-asi">ASI</span>`;
      if (state === "te") return `<span class="badge badge-te">TE</span>`;
      if (state === "sin_cobertura") return `<span class="badge badge-sc">SC</span>`;
      if (state === "ppc") return `<span class="badge badge-ppc">PPC</span>`;
      return "";
    };

    const theadDays = monthDays
      .map(
        (d) =>
          `<th><div class="th-day">${WEEKDAY_SHORT[d.getUTCDay()]}</div><div class="th-num">${d.getUTCDate()}</div></th>`
      )
      .join("");

    const tbodyRows = matrix
      .map((row) => {
        const dayCells = monthDays
          .map((d) => {
            const dateKey = toDateKey(d);
            const code = row.cells.get(dateKey) || "·";
            const exec = executionByCell[`${row.puestoId}|${row.slotNumber}|${dateKey}`];
            return `<td><div class="cell ${shiftClass(code)}"><span>${escapeHtml(code)}</span>${execBadge(exec)}</div></td>`;
          })
          .join("");

        return `<tr>
          <td class="sticky-col">
            <div class="puesto">${escapeHtml(row.puestoName)}</div>
            <div class="meta">${escapeHtml(`${row.shiftStart}-${row.shiftEnd} · S${row.slotNumber}`)}</div>
            <div class="guardia">${escapeHtml(row.guardiaName ?? "Sin asignar")}</div>
          </td>
          ${dayCells}
        </tr>`;
      })
      .join("");

    const html = `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <style>
    @page { size: A4 landscape; margin: 10mm; }
    * { box-sizing: border-box; }
    body { font-family: Inter, Arial, sans-serif; color: #0f172a; font-size: 9px; margin: 0; }
    .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #0f766e; padding-bottom: 8px; margin-bottom: 8px; }
    .header-left img { height: 24px; }
    .title { font-size: 14px; font-weight: 700; color: #0f172a; margin: 0; }
    .subtitle { margin-top: 2px; color: #334155; }
    .meta-right { text-align: right; color: #334155; }
    table { width: 100%; border-collapse: collapse; table-layout: fixed; }
    th, td { border: 1px solid #cbd5e1; padding: 2px; text-align: center; vertical-align: middle; }
    th { background: #f1f5f9; font-weight: 700; }
    .th-day { font-size: 8px; color: #475569; }
    .th-num { font-size: 10px; }
    .sticky-col { text-align: left; width: 180px; min-width: 180px; }
    .puesto { font-weight: 700; }
    .meta { color: #475569; font-size: 8px; }
    .guardia { color: #0f172a; font-size: 8px; margin-top: 1px; }
    .cell { position: relative; border-radius: 3px; min-height: 15px; display: flex; align-items: center; justify-content: center; font-weight: 700; }
    .shift-t { background: #e8f8ee; color: #166534; }
    .shift-d { background: #e5e7eb; color: #374151; }
    .shift-v { background: #dcfce7; color: #166534; }
    .shift-l { background: #fef3c7; color: #92400e; }
    .shift-p { background: #ffedd5; color: #9a3412; }
    .shift-empty { background: #ffffff; color: #94a3b8; }
    .badge { position: absolute; right: -1px; bottom: -1px; font-size: 7px; line-height: 1; padding: 1px 2px; border-radius: 3px; color: #fff; }
    .badge-asi { background: #16a34a; }
    .badge-te { background: #e11d48; }
    .badge-sc { background: #d97706; }
    .badge-ppc { background: #64748b; }
    .legend { margin-top: 8px; border-top: 1px solid #cbd5e1; padding-top: 6px; display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
    .legend h4 { margin: 0 0 4px; font-size: 9px; }
    .legend-row { display: flex; align-items: center; gap: 6px; color: #334155; font-size: 8px; }
    .sw { width: 12px; height: 8px; border: 1px solid #94a3b8; border-radius: 2px; }
    .foot { margin-top: 8px; color: #64748b; font-size: 7px; text-align: right; }
  </style>
</head>
<body>
  <div class="header">
    <div class="header-left">
      <img src="${logoDataUrl}" alt="Gard" />
      <h1 class="title">Pauta Mensual Operativa</h1>
      <div class="subtitle">Cliente: ${escapeHtml(installation.account?.name ?? "N/A")} · Instalación: ${escapeHtml(installation.name)}</div>
    </div>
    <div class="meta-right">
      <div><strong>${MESES[month - 1]} ${year}</strong></div>
      <div>Emitido: ${new Date().toLocaleDateString("es-CL")}</div>
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th class="sticky-col">Puesto / Guardia</th>
        ${theadDays}
      </tr>
    </thead>
    <tbody>
      ${tbodyRows}
    </tbody>
  </table>

  <div class="legend">
    <div>
      <h4>Planificación (color base)</h4>
      <div class="legend-row"><span class="sw" style="background:#e8f8ee"></span>T = Trabaja</div>
      <div class="legend-row"><span class="sw" style="background:#e5e7eb"></span>- = Descanso</div>
      <div class="legend-row"><span class="sw" style="background:#dcfce7"></span>V = Vacaciones</div>
      <div class="legend-row"><span class="sw" style="background:#fef3c7"></span>L = Licencia</div>
      <div class="legend-row"><span class="sw" style="background:#ffedd5"></span>P = Permiso</div>
    </div>
    <div>
      <h4>Ejecución real (badge)</h4>
      <div class="legend-row"><span class="badge badge-asi" style="position:static">ASI</span>Asistió efectivamente</div>
      <div class="legend-row"><span class="badge badge-te" style="position:static">TE</span>Cubierto con turno extra / reemplazo</div>
      <div class="legend-row"><span class="badge badge-sc" style="position:static">SC</span>Sin cobertura</div>
      <div class="legend-row"><span class="badge badge-ppc" style="position:static">PPC</span>Slot PPC sin planificación</div>
    </div>
  </div>
  <div class="foot">Documento operativo GARD · Uso cliente</div>
</body>
</html>`;

    const isDev = process.env.NODE_ENV === "development";
    const executablePath = isDev ? undefined : await chromiumPkg.executablePath();
    browser = await chromium.launch({
      executablePath,
      headless: true,
      args: isDev ? ["--no-sandbox", "--disable-setuid-sandbox"] : chromiumPkg.args,
    });

    const context = await browser.newContext({
      viewport: { width: 1600, height: 1100 },
      deviceScaleFactor: 1,
    });
    const page = await context.newPage();
    await page.setContent(html, { waitUntil: "load" });
    await page.waitForTimeout(300);

    const pdfBuffer = await page.pdf({
      format: "A4",
      landscape: true,
      printBackground: true,
      margin: { top: "8mm", right: "8mm", bottom: "8mm", left: "8mm" },
    });

    await browser.close();
    browser = undefined;

    const fileName = `PautaMensual_${installation.name.replace(/\s+/g, "_")}_${year}-${String(month).padStart(2, "0")}.pdf`;
    return new NextResponse(new Uint8Array(pdfBuffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${fileName}"`,
      },
    });
  } catch (error) {
    if (browser) await browser.close();
    console.error("[OPS] Error exportando pauta mensual PDF:", error);
    return NextResponse.json(
      { success: false, error: "No se pudo exportar la pauta mensual en PDF" },
      { status: 500 }
    );
  }
}

