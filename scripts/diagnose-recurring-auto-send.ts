/**
 * Diagnóstico de un FinanceDteRecurringTemplate específico:
 * - Valida que crmAccountId existe.
 * - Valida que recipientContactIds existen y tienen email.
 * - Lista qué emails se enviarían si el cron corriera ahora.
 * - NO ejecuta nada — solo reporta.
 *
 * Uso:
 *   npx ts-node -r tsconfig-paths/register \
 *     --compiler-options '{"module":"CommonJS"}' \
 *     scripts/diagnose-recurring-auto-send.ts <TEMPLATE_ID> [TENANT_ID]
 */
import { prisma } from "@/lib/prisma";

async function main() {
  const templateId = process.argv[2];
  const tenantIdArg = process.argv[3];
  if (!templateId) {
    console.error("Uso: ... scripts/diagnose-recurring-auto-send.ts <TEMPLATE_ID> [TENANT_ID]");
    process.exit(1);
  }

  const template = await prisma.financeDteRecurringTemplate.findFirst({
    where: tenantIdArg
      ? { id: templateId, tenantId: tenantIdArg }
      : { id: templateId },
  });
  if (!template) {
    console.error("Template no encontrado.");
    process.exit(2);
  }

  console.log("\n=== Template ===");
  console.log(`Name: ${template.name}`);
  console.log(`isActive: ${template.isActive}`);
  console.log(`autoSendEmail: ${template.autoSendEmail}`);
  console.log(`autoSendProforma: ${template.autoSendProforma}`);
  console.log(`autoSendPaymentStatement: ${template.autoSendPaymentStatement}`);
  console.log(`crmAccountId: ${template.crmAccountId}`);
  console.log(`recipientContactIds: ${JSON.stringify(template.recipientContactIds)}`);
  console.log(`lastRunAt: ${template.lastRunAt?.toISOString() ?? "never"}`);
  console.log(`nextRunAt: ${template.nextRunAt?.toISOString() ?? "—"}`);

  // CRM account check
  if (template.crmAccountId) {
    const account = await prisma.crmAccount.findFirst({
      where: { id: template.crmAccountId, tenantId: template.tenantId },
    });
    console.log(`\nCRM Account: ${account ? "OK (" + account.name + ")" : "❌ NO ENCONTRADA"}`);
  } else if (template.autoSendProforma || template.autoSendPaymentStatement) {
    console.log("\n⚠️  autoSendProforma/Estado activos pero crmAccountId es NULL");
  }

  // Contacts check
  if (template.recipientContactIds && template.recipientContactIds.length > 0) {
    const contacts = await prisma.crmContact.findMany({
      where: {
        tenantId: template.tenantId,
        id: { in: template.recipientContactIds },
      },
    });
    console.log(`\n=== Contactos (${contacts.length}/${template.recipientContactIds.length}) ===`);
    for (const c of contacts) {
      const hasEmail = !!(c.email && c.email.trim());
      const correctAccount = c.accountId === template.crmAccountId;
      console.log(
        `  ${hasEmail ? "✓" : "✗"} ${c.firstName} ${c.lastName} <${c.email ?? "SIN EMAIL"}> ${correctAccount ? "" : "⚠️ account_id MISMATCH"}`,
      );
    }
    const missing = template.recipientContactIds.filter(
      (id) => !contacts.find((c) => c.id === id),
    );
    if (missing.length > 0) {
      console.log(`  ❌ Contactos NO ENCONTRADOS: ${missing.join(", ")}`);
    }
  } else if (template.autoSendProforma || template.autoSendPaymentStatement) {
    console.log("\n⚠️  autoSendProforma/Estado activos pero recipientContactIds está vacío");
  }

  // Últimos runs
  const runs = await prisma.financeDteRecurringRun.findMany({
    where: { tenantId: template.tenantId, templateId },
    orderBy: { ranAt: "desc" },
    take: 5,
  });
  console.log(`\n=== Últimos 5 runs ===`);
  for (const r of runs) {
    console.log(
      `  ${r.ranAt.toISOString()} · status=${r.status} · dte=${r.dteId ?? "—"} · error=${r.error ?? "—"} · issues=${r.autoSendIssues ? JSON.stringify(r.autoSendIssues) : "—"}`,
    );
  }

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(99);
});
