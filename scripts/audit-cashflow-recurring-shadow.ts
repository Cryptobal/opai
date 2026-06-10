import { PrismaClient } from "@prisma/client";
import { buildProjection } from "../src/modules/finance/cashflow/projection.service";
import { resolveUfForOccurrence } from "../src/modules/finance/cashflow/uf-resolver";
import { addMonths, addWeeks, isAfter } from "date-fns";

const prisma = new PrismaClient();
const T = "clgard00000000000000001";
const FROM = new Date("2026-05-25");
const TO = new Date("2026-07-31");

const clp = (n: number) =>
  "$" + Math.round(n).toLocaleString("es-CL");

interface Line {
  quantity?: number | string;
  unitPrice?: number | string;
  unitPriceUf?: number | string;
  discountPct?: number | string;
}

/** READ-ONLY: audita contrato↔plantilla y compara ingreso semanal
 *  (proyección actual vs. solo-facturas-recurrentes). No escribe nada. */
async function main() {
  // ── PARTE A: cobertura y config contrato↔plantilla ──
  const contracts = await prisma.financeCashflowItem.findMany({
    where: { tenantId: T, isActive: true, kind: "INCOME", source: "CONTRACT" },
    select: {
      id: true, name: true, currency: true, hasIpcAdjustment: true,
      ipcAdjustmentMonths: true, endDate: true, crmAccountId: true,
      installationId: true, sourceRefId: true,
    },
  });
  const templates = await prisma.financeDteRecurringTemplate.findMany({
    where: { tenantId: T, isActive: true },
    select: {
      id: true, name: true, currency: true, endDate: true, startDate: true,
      crmAccountId: true, installationId: true, contractDocumentId: true,
      frequency: true, dayOfMonth: true, dayOfWeek: true, monthOfYear: true,
      ufFixingPolicy: true, ufFixingDay: true, lines: true, receiverName: true,
    },
  });

  const tplByKey = new Map<string, typeof templates[number]>();
  for (const t of templates) tplByKey.set(`${t.crmAccountId}|${t.installationId ?? ""}`, t);

  console.log("════════ PARTE A · COBERTURA CONTRATO → PLANTILLA ════════\n");
  let sinTpl = 0, ufMismatch = 0, finMismatch = 0;
  for (const c of contracts) {
    const tpl = tplByKey.get(`${c.crmAccountId}|${c.installationId ?? ""}`);
    const flags: string[] = [];
    if (!tpl) { flags.push("❌ SIN PLANTILLA (ingreso desaparecería)"); sinTpl++; }
    else {
      if (c.currency === "UF" && tpl.currency !== "UF") { flags.push("⚠️ contrato UF / plantilla CLP (sub-proyecta a futuro)"); ufMismatch++; }
      if (c.endDate && !tpl.endDate) { flags.push("⚠️ contrato con fin / plantilla ∞ (sobre-proyecta cola)"); finMismatch++; }
    }
    if (c.hasIpcAdjustment) flags.push(`ℹ️ IPC cada ${c.ipcAdjustmentMonths}m (a aplicar en proyección)`);
    console.log(
      `• "${c.name}" [${c.currency}${c.endDate ? ` fin ${c.endDate.toISOString().slice(0,10)}` : " ∞"}]` +
      (flags.length ? `\n    ${flags.join("\n    ")}` : "  ✅ OK"),
    );
  }
  console.log(`\nResumen: ${contracts.length} contratos · sinPlantilla=${sinTpl} · UFmismatch=${ufMismatch} · finMismatch=${finMismatch}`);

  // ── PARTE B: sombra de ingreso semanal ──
  console.log("\n\n════════ PARTE B · INGRESO SEMANAL: ACTUAL vs SOLO-RECURRENTES ════════\n");
  const proj = await buildProjection(T, { from: FROM, to: TO, granularity: "weekly" });

  // Ingreso "solo recurrentes": proyectar desde las plantillas (UF aplicado,
  // sin IPC — en la ventana de ~8 sem el IPC es despreciable). Bucketea en los
  // mismos buckets que la proyección actual.
  const tplIncomeByBucket = new Map<string, number>();
  for (const t of templates) {
    const lines = (t.lines as Line[] | null) ?? [];
    const subtotal = lines.reduce((s, l) => {
      const qty = Number(l.quantity ?? 1);
      const price = Number(l.unitPrice ?? l.unitPriceUf ?? 0);
      const disc = Number(l.discountPct ?? 0) / 100;
      return s + qty * price * (1 - disc);
    }, 0);
    if (subtotal <= 0) continue;
    let cursor = new Date(t.startDate);
    const stop = t.endDate ? new Date(t.endDate) : TO;
    while (!isAfter(cursor, TO) && !isAfter(cursor, stop)) {
      if (cursor >= FROM && cursor <= TO) {
        let amount = subtotal * 1.19;
        if (t.currency === "UF") {
          const uf = await resolveUfForOccurrence(t.ufFixingPolicy, t.ufFixingDay, cursor);
          amount = subtotal * uf * 1.19;
        }
        const b = proj.buckets.find((bk) => cursor >= bk.start && cursor <= bk.end);
        if (b) tplIncomeByBucket.set(b.key, (tplIncomeByBucket.get(b.key) ?? 0) + amount);
      }
      cursor =
        t.frequency === "biweekly" ? addWeeks(cursor, 2)
        : t.frequency === "weekly" ? addWeeks(cursor, 1)
        : t.frequency === "yearly" ? addMonths(cursor, 12)
        : addMonths(cursor, 1);
    }
  }

  console.log(
    "semana".padEnd(26) + "ACTUAL".padStart(16) + "SOLO-RECUR".padStart(16) + "Δ".padStart(16),
  );
  for (const b of proj.buckets) {
    const actual = b.income;
    const recur = tplIncomeByBucket.get(b.key) ?? 0;
    console.log(
      `${b.label} [${b.start.toISOString().slice(5,10)}→${b.end.toISOString().slice(5,10)}]`.padEnd(26) +
      clp(actual).padStart(16) + clp(recur).padStart(16) + clp(recur - actual).padStart(16),
    );
  }
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
