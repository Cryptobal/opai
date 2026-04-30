/**
 * API Route: /api/cron/lead-escalation
 * GET - Detecta leads pending sin contactar después de 30 min y dispara
 *       una push notification de escalación a los admins del tenant.
 *
 * Diseñado para ejecutarse cada 5 minutos vía Vercel Cron.
 * Solo opera dentro de horario hábil de Chile (lunes-viernes 9:00-19:00,
 * America/Santiago) — fuera de eso retorna sin trabajo.
 * Protegido con CRON_SECRET.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json(
      { success: false, error: "CRON_SECRET not configured" },
      { status: 500 }
    );
  }
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  const now = new Date();
  // Detectar día/hora en zona Chile sin depender de toLocaleString del runtime
  // serverless. Usamos partes formateadas explícitamente.
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Santiago",
    weekday: "short",
    hour: "2-digit",
    hour12: false,
  });
  const parts = fmt.formatToParts(now);
  const weekday = parts.find((p) => p.type === "weekday")?.value ?? "";
  const hourStr = parts.find((p) => p.type === "hour")?.value ?? "0";
  const hour = parseInt(hourStr, 10);
  const isWeekday = ["Mon", "Tue", "Wed", "Thu", "Fri"].includes(weekday);
  const isBusinessHours = isWeekday && hour >= 9 && hour < 19;

  if (!isBusinessHours) {
    return NextResponse.json({
      success: true,
      skipped: true,
      reason: "outside_business_hours",
    });
  }

  const thirtyMinAgo = new Date(now.getTime() - 30 * 60 * 1000);
  const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);

  const leads = await prisma.crmLead.findMany({
    where: {
      status: "pending",
      firstContactAt: null,
      escalatedAt: null,
      createdAt: { gte: twoHoursAgo, lte: thirtyMinAgo },
    },
    take: 50,
  });

  let escalated = 0;
  for (const lead of leads) {
    try {
      const { notify } = await import("@/lib/notifications/notify");
      const minutesSince = Math.round(
        (now.getTime() - lead.createdAt.getTime()) / 60000
      );
      const empresa = lead.companyName ?? "Lead";
      await notify({
        tenantId: lead.tenantId,
        type: "lead_escalation",
        title: "⚠️ Lead sin contactar",
        body: `${empresa} hace ${minutesSince} min sin respuesta`,
        link: `/crm/leads/${lead.id}`,
        data: { leadId: lead.id },
      });
      await prisma.crmLead.update({
        where: { id: lead.id },
        data: { escalatedAt: new Date() },
      });
      escalated++;
    } catch (e) {
      console.error(`Failed to escalate lead ${lead.id}`, e);
    }
  }

  return NextResponse.json({
    success: true,
    escalated,
    total: leads.length,
  });
}
