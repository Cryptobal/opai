import { notify } from "@/lib/notifications/notify";
import { formatCLP } from "@/lib/utils";
import type { BalanceDiscrepancy } from "@/modules/finance/banking/bank-balance.service";

export async function notifyBankBalanceDiscrepancy(args: {
  tenantId: string;
  accountLabel: string;
  discrepancy: BalanceDiscrepancy;
  link?: string;
}): Promise<void> {
  const { reported, computed, delta, asOfDate } = args.discrepancy;
  const signed =
    delta > 0 ? `+${formatCLP(delta)}` : formatCLP(delta);
  await notify({
    tenantId: args.tenantId,
    type: "bank_balance_discrepancy",
    title: `Diferencia de saldo bancario — ${args.accountLabel}`,
    body: `Cuenta ${args.accountLabel} al ${asOfDate}. Reportado ${formatCLP(reported)} · calculado ${formatCLP(computed)} · diferencia ${signed}. Probable movimiento no enviado por el proveedor o pago masivo.`,
    link: args.link ?? "/finanzas/bancos?tab=accounts",
    data: {
      reported,
      computed,
      delta,
      asOfDate,
      accountLabel: args.accountLabel,
    },
  });
}
