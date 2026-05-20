/**
 * scripts/diagnose-auto-send-today.ts
 *
 * READ-ONLY. Diagnostica el estado del auto-envío de Proforma y Estado de
 * Pago para todos los borradores generados HOY por el cron
 * `finance-recurring-billing`.
 *
 * Output:
 *   - Console: reporte legible.
 *   - Archivo: scripts/.diagnosis-auto-send-today.json (estructurado).
 *
 * Uso:
 *   npx tsx scripts/diagnose-auto-send-today.ts
 *   npx tsx scripts/diagnose-auto-send-today.ts --tenant gard
 */
import { prisma } from "../src/lib/prisma";
import { writeFileSync } from "fs";
import { join } from "path";

async function resolveTenant(
  slugOverride?: string,
): Promise<{ id: string; name: string; slug: string }> {
  const slug = slugOverride ?? "gard";
  const bySlug = await prisma.tenant.findFirst({
    where: { slug },
    select: { id: true, name: true, slug: true },
  });
  if (bySlug) return bySlug;

  const firstActive = await prisma.tenantDteConfig.findFirst({
    where: { isActive: true },
    select: { tenant: { select: { id: true, name: true, slug: true } } },
  });
  if (firstActive?.tenant) {
    console.warn(
      `Tenant slug='${slug}' no encontrado. Usando primer DTE-activo: ${firstActive.tenant.name}`,
    );
    return firstActive.tenant;
  }
  throw new Error("No se encontró ningún tenant con DTE activo");
}

async function main() {
  const args = process.argv;
  const tenantArgIdx = args.indexOf("--tenant");
  const argSlug =
    tenantArgIdx >= 0 && args[tenantArgIdx + 1] && !args[tenantArgIdx + 1].startsWith("--")
      ? args[tenantArgIdx + 1]
      : undefined;

  const tenant = await resolveTenant(argSlug);
  console.log(`\n=== DIAGNÓSTICO AUTO-ENVÍO ===`);
  console.log(`Tenant: ${tenant.name} (${tenant.slug})`);
  console.log(`Fecha: ${new Date().toISOString().slice(0, 10)}\n`);

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date();
  todayEnd.setHours(23, 59, 59, 999);

  // ── Q1: Runs del cron hoy ──
  const runs = await prisma.financeDteRecurringRun.findMany({
    where: { tenantId: tenant.id, ranAt: { gte: todayStart, lte: todayEnd } },
    orderBy: { ranAt: "desc" },
    include: {
      template: {
        select: {
          id: true,
          name: true,
          autoSendProforma: true,
          autoSendPaymentStatement: true,
          recipientContactIds: true,
        },
      },
    },
  });

  console.log(`Q1 · Runs del cron HOY: ${runs.length}`);
  let runsClean = 0;
  let runsWithIssues = 0;
  let runsFailed = 0;
  for (const r of runs) {
    const issues = r.autoSendIssues as Array<{ variant: string; error: string }> | null;
    const recipientCount = r.template.recipientContactIds.length;
    const autoActive =
      r.template.autoSendProforma || r.template.autoSendPaymentStatement;

    if (r.status === "failed") runsFailed++;
    else if (issues && issues.length > 0) runsWithIssues++;
    else runsClean++;

    const tag = r.status === "failed" ? "[FAIL]" : issues && issues.length > 0 ? "[WARN]" : "[OK]  ";
    console.log(
      `  ${tag} ${r.template.name.padEnd(40)} recipients=${recipientCount} autoActive=${autoActive} status=${r.status}` +
        (issues ? ` issues=${issues.length}` : "") +
        (r.error ? ` ERROR="${r.error}"` : ""),
    );
    if (issues)
      for (const i of issues) console.log(`      - ${i.variant}: ${i.error}`);
  }
  console.log(
    `\n  Resumen: OK ${runsClean} · WARN ${runsWithIssues} · FAIL ${runsFailed}\n`,
  );

  // ── Q2: Borradores generados hoy con envío pendiente ──
  const pendingDrafts = await prisma.financeDte.findMany({
    where: {
      tenantId: tenant.id,
      siiStatus: "DRAFT",
      createdAt: { gte: todayStart, lte: todayEnd },
      OR: [
        { AND: [{ requireProforma: true }, { proformaStatus: "NONE" }] },
        { AND: [{ requireEstadoPago: true }, { estadoPagoStatus: "NONE" }] },
      ],
    },
    select: {
      id: true,
      receiverName: true,
      receiverRut: true,
      totalAmount: true,
      requireProforma: true,
      proformaStatus: true,
      proformaRecipientContactIds: true,
      requireEstadoPago: true,
      estadoPagoStatus: true,
      estadoPagoRecipientContactIds: true,
    },
    orderBy: { createdAt: "desc" },
  });

  console.log(`Q2 · Borradores HOY con envío pendiente: ${pendingDrafts.length}`);
  let withoutRecipients = 0;
  let withRecipientsButNotSent = 0;
  for (const d of pendingDrafts.slice(0, 10)) {
    const proformaRec = d.proformaRecipientContactIds.length;
    const epRec = d.estadoPagoRecipientContactIds.length;
    const hasRecipients =
      (d.requireProforma && proformaRec > 0) ||
      (d.requireEstadoPago && epRec > 0);
    if (hasRecipients) withRecipientsButNotSent++;
    else withoutRecipients++;
    console.log(
      `  ${(d.receiverName ?? "").slice(0, 30).padEnd(30)} ` +
        `proforma=${d.proformaStatus}(${proformaRec}) ep=${d.estadoPagoStatus}(${epRec}) ` +
        `$${Number(d.totalAmount).toLocaleString("es-CL")}`,
    );
  }
  if (pendingDrafts.length > 10)
    console.log(`  ... y ${pendingDrafts.length - 10} más`);
  console.log(
    `\n  Resumen: ${withRecipientsButNotSent} con destinatarios pero NO enviados (BUG si > 0) · ${withoutRecipients} sin destinatarios\n`,
  );

  // ── Q3: Email logs de hoy ──
  const emailLogs = await prisma.financeDteEmailLog.findMany({
    where: {
      tenantId: tenant.id,
      sentAt: { gte: todayStart, lte: todayEnd },
      kind: { in: ["AUTO_PROFORMA", "MANUAL_PROFORMA", "AUTO_ESTADO_PAGO", "MANUAL_ESTADO_PAGO"] },
    },
    orderBy: { sentAt: "desc" },
    take: 100,
  });

  console.log(`Q3 · Email logs (Proforma/EP) HOY: ${emailLogs.length}`);
  const byStatus = emailLogs.reduce<Record<string, number>>((acc, l) => {
    acc[l.status] = (acc[l.status] || 0) + 1;
    return acc;
  }, {});
  console.log(`  Status: ${JSON.stringify(byStatus)}`);
  const failedLogs = emailLogs.filter(
    (l) => l.status === "failed" || l.status === "FAILED",
  );
  if (failedLogs.length > 0) {
    console.log(`\n  ${failedLogs.length} envíos FALLIDOS:`);
    for (const l of failedLogs.slice(0, 5)) {
      console.log(`     ${l.kind} -> ${l.to.join(", ")} : ${l.errorMessage}`);
    }
  }

  // ── Q4: Plantillas con auto-envío activo pero sin destinatarios ──
  const templatesNoRecipients = await prisma.financeDteRecurringTemplate.findMany({
    where: {
      tenantId: tenant.id,
      isActive: true,
      OR: [{ autoSendProforma: true }, { autoSendPaymentStatement: true }],
      recipientContactIds: { isEmpty: true },
    },
    select: {
      id: true,
      name: true,
      receiverName: true,
      autoSendProforma: true,
      autoSendPaymentStatement: true,
    },
  });
  console.log(
    `\nQ4 · Plantillas con auto-envío ON pero recipientContactIds vacío: ${templatesNoRecipients.length}`,
  );
  for (const t of templatesNoRecipients.slice(0, 10)) {
    console.log(
      `  • ${t.name} -> ${t.receiverName} (proforma=${t.autoSendProforma} ep=${t.autoSendPaymentStatement})`,
    );
  }

  const diagnostic = (() => {
    if (runs.length === 0) {
      return {
        rootCause: "CRON_DID_NOT_RUN",
        message:
          "El cron finance-recurring-billing NO corrió hoy. Verificar vercel.json o ejecutar manualmente.",
        actionable: "MANUAL_TRIGGER_NEEDED",
      };
    }
    if (failedLogs.length > 0) {
      return {
        rootCause: "ENVIO_FALLO_TECNICO",
        message: `${failedLogs.length} envíos fallaron técnicamente. Revisar errorMessage (Resend, PDF render, etc.).`,
        actionable: "FIX_TECHNICAL_ERROR",
        sampleErrors: failedLogs
          .slice(0, 3)
          .map((l) => ({ kind: l.kind, to: l.to, error: l.errorMessage })),
      };
    }
    if (withRecipientsButNotSent > 0) {
      return {
        rootCause: "BUG_DRAFT_HAS_RECIPIENTS_BUT_NOT_SENT",
        message: `${withRecipientsButNotSent} borradores tienen destinatarios cargados pero no se enviaron. Bug real.`,
        actionable: "BULK_RETRY",
      };
    }
    if (withoutRecipients > 0 && templatesNoRecipients.length > 0) {
      return {
        rootCause: "TEMPLATES_LACK_RECIPIENTS",
        message: `${templatesNoRecipients.length} plantillas con auto-envío ON no tienen destinatarios cargados. Corregir + bulk-retry con backfill.`,
        actionable: "FIX_TEMPLATES_AND_BULK_RETRY",
      };
    }
    return {
      rootCause: "ALL_OK",
      message: "Diagnóstico no detecta problema. Pedir confirmación al usuario.",
      actionable: "NONE",
    };
  })();

  const diagnosis = {
    timestamp: new Date().toISOString(),
    tenant,
    summary: {
      runs: { total: runs.length, clean: runsClean, withIssues: runsWithIssues, failed: runsFailed },
      pendingDrafts: {
        total: pendingDrafts.length,
        withRecipientsButNotSent,
        withoutRecipients,
      },
      emailLogs: { total: emailLogs.length, byStatus, failed: failedLogs.length },
      templatesMissingRecipients: templatesNoRecipients.length,
    },
    diagnostic,
  };

  const outPath = join(process.cwd(), "scripts", ".diagnosis-auto-send-today.json");
  writeFileSync(outPath, JSON.stringify(diagnosis, null, 2));
  console.log(`\nDiagnóstico guardado en: ${outPath}`);
  console.log(`\nROOT CAUSE: ${diagnostic.rootCause}`);
  console.log(`  ${diagnostic.message}`);
  console.log(`  Action: ${diagnostic.actionable}\n`);

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
