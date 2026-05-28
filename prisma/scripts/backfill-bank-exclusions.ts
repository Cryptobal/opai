/**
 * Backfill de exclusiones automáticas de bank tx (Fase B).
 *
 * Recorre todos los tenants y marca como excluidas las transferencias internas
 * (mismo holderRut / cuentas propias distintas, montos opuestos, ±2 días) y las
 * comisiones bancarias bajo el umbral configurado. Idempotente: no toca las
 * marcadas manual_override.
 *
 * NUNCA se ejecuta automáticamente. Runbook manual:
 *   vercel env pull
 *   npx tsx prisma/scripts/backfill-bank-exclusions.ts --dry-run
 *   npx tsx prisma/scripts/backfill-bank-exclusions.ts
 *
 * Self-contained (PrismaClient propio) para no depender de imports "server-only"
 * ni del alias "@/". Replica la lógica de exclusion-rules.service.ts.
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const COMMISSION_RE =
  /comisi[óo]n|mantenci[óo]n|cargo\s+auto|cargo\s+mensual|iva\s+s\/?\s*cargo|iva\s+comisi/i;

async function applyForTenant(
  tenantId: string,
  dryRun: boolean,
): Promise<{ interna: number; comision: number }> {
  const cfg = await prisma.financeCashflowConfig.findFirst({
    where: { tenantId },
    select: { bankCommissionThresholdClp: true },
  });
  const threshold = cfg?.bankCommissionThresholdClp ?? 10_000;

  const since = new Date();
  since.setDate(since.getDate() - 90);
  const txs = await prisma.financeBankTransaction.findMany({
    where: {
      tenantId,
      hiddenAt: null,
      transactionDate: { gte: since },
      OR: [{ excludedReason: null }, { excludedReason: { in: ["interna", "comision"] } }],
    },
  });

  const ownAccounts = await prisma.financeBankAccount.findMany({
    where: { tenantId, isActive: true },
    select: { id: true },
  });
  const ownIds = new Set(ownAccounts.map((a) => a.id));

  // Internas: montos opuestos, cuentas propias distintas, ±2 días.
  const internal = new Set<string>();
  const byAmount = new Map<string, typeof txs>();
  for (const t of txs) {
    const k = Math.abs(Number(t.amount)).toString();
    const list = byAmount.get(k);
    if (list) list.push(t);
    else byAmount.set(k, [t]);
  }
  const TWO_DAYS = 2 * 24 * 3600 * 1000;
  for (const [, list] of byAmount) {
    if (list.length < 2) continue;
    const pos = list.filter((t) => Number(t.amount) > 0);
    const neg = list.filter((t) => Number(t.amount) < 0);
    for (const p of pos) {
      for (const n of neg) {
        if (p.bankAccountId === n.bankAccountId) continue;
        if (!ownIds.has(p.bankAccountId) || !ownIds.has(n.bankAccountId)) continue;
        if (Math.abs(p.transactionDate.getTime() - n.transactionDate.getTime()) > TWO_DAYS)
          continue;
        internal.add(p.id);
        internal.add(n.id);
      }
    }
  }

  // Comisiones bajo umbral.
  const commission = new Set<string>();
  for (const t of txs) {
    if (internal.has(t.id)) continue;
    if (Math.abs(Number(t.amount)) > threshold) continue;
    if (COMMISSION_RE.test(t.description ?? "")) commission.add(t.id);
  }

  if (dryRun) {
    return { interna: internal.size, comision: commission.size };
  }

  let interna = 0;
  let comision = 0;
  for (const id of internal) {
    await prisma.financeBankTransaction.update({
      where: { id },
      data: { excludedReason: "interna", excludedAt: new Date(), excludedBy: "backfill" },
    });
    interna++;
  }
  for (const id of commission) {
    await prisma.financeBankTransaction.update({
      where: { id },
      data: { excludedReason: "comision", excludedAt: new Date(), excludedBy: "backfill" },
    });
    comision++;
  }
  return { interna, comision };
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  if (dryRun) console.log("DRY RUN — no escribe cambios\n");
  const tenants = await prisma.tenant.findMany({ select: { id: true, name: true } });
  for (const t of tenants) {
    const r = await applyForTenant(t.id, dryRun);
    console.log(`[${t.name}] interna=${r.interna} comision=${r.comision}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
