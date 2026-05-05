/**
 * Cron: Alert tenants whose digital DTE certificate is about to expire.
 *
 * Schedule: daily at 11:00 UTC (= 08:00 hora Chile en horario invierno).
 * Sends a notification at 30, 15, 7, and 1 days before expiry, and deactivates
 * emission for tenants whose certificate has already expired.
 *
 * Protected with CRON_SECRET env var.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { notify } from "@/lib/notifications/notify";

const ALERT_DAYS = [30, 15, 7, 1];

export const maxDuration = 120;

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret && process.env.NODE_ENV === "production") {
    return NextResponse.json(
      { success: false, error: "CRON_SECRET not configured" },
      { status: 500 }
    );
  }
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  const certs = await prisma.tenantDteCertificate.findMany({
    where: { notAfter: { gte: today } },
    select: {
      id: true,
      tenantId: true,
      fileName: true,
      rutTitular: true,
      nombreTitular: true,
      notAfter: true,
    },
  });

  const alerts: Array<{ tenantId: string; daysUntilExpiry: number }> = [];

  for (const cert of certs) {
    const daysUntilExpiry = Math.ceil(
      (cert.notAfter.getTime() - today.getTime()) / 86400000
    );
    if (!ALERT_DAYS.includes(daysUntilExpiry)) continue;

    const titular = cert.nombreTitular ?? cert.rutTitular;
    const expiryDate = cert.notAfter.toISOString().split("T")[0];
    const dayLabel = daysUntilExpiry === 1 ? "1 día" : `${daysUntilExpiry} días`;

    try {
      await notify({
        tenantId: cert.tenantId,
        type: "dte_certificate_expiring",
        title: `Certificado digital vence en ${dayLabel}`,
        body: `El certificado digital de ${titular} expira el ${expiryDate}. Sube uno nuevo para no interrumpir la emisión de DTEs.`,
        link: "/opai/configuracion/finanzas/dte",
        data: {
          certificateId: cert.id,
          rutTitular: cert.rutTitular,
          notAfter: expiryDate,
          daysUntilExpiry,
        },
      });
    } catch (err) {
      console.error(
        `[dte-cert-expiry-alerts] notify failed for tenant=${cert.tenantId}:`,
        err
      );
    }

    alerts.push({ tenantId: cert.tenantId, daysUntilExpiry });
  }

  // Deactivate emission for tenants whose certificate has already expired.
  const expired = await prisma.tenantDteCertificate.findMany({
    where: { notAfter: { lt: today } },
    select: { tenantId: true },
  });

  let deactivated = 0;
  for (const e of expired) {
    const r = await prisma.tenantDteConfig.updateMany({
      where: { tenantId: e.tenantId, isActive: true },
      data: { isActive: false },
    });
    deactivated += r.count;
  }

  console.log(
    `[dte-cert-expiry-alerts] alerts=${alerts.length} expired=${expired.length} deactivated=${deactivated}`
  );

  return NextResponse.json({
    success: true,
    data: {
      alertsSent: alerts.length,
      expiredAndDeactivated: deactivated,
      details: alerts,
    },
  });
}
