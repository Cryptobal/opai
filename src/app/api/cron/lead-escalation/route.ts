/**
 * API Route: /api/cron/lead-escalation
 * GET - Cron que detecta leads pending sin contactar > 30 min y dispara push de alerta.
 * Solo corre en horario hábil Chile (lunes-viernes 9:00-19:00 America/Santiago).
 * Protegido con CRON_SECRET.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json(
      { success: false, error: "CRON_SECRET not configured" },
      { status: 500 }
    );
  }
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  const now = new Date();
  const chileTime = new Date(now.toLocaleString("en-US", { timeZone: "America/Santiago" }));
  const day = chileTime.getDay();
  const hour = chileTime.getHours();
  const isBusinessHours = day >= 1 && day <= 5 && hour >= 9 && hour < 19;

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
      const { sendPushToAdmins } = await import("@/lib/pwa/push-service");
      const minutesSince = Math.round((now.getTime() - lead.createdAt.getTime()) / 60000);
      await sendPushToAdmins(
        lead.tenantId,
        "lead_escalation",
        "⚠️ Lead sin contactar",
        `${lead.companyName ?? "Lead"} hace ${minutesSince} min sin respuesta`,
        `/crm/leads/${lead.id}`
      );
      await prisma.crmLead.update({
        where: { id: lead.id },
        data: { escalatedAt: new Date() },
      });
      escalated++;
    } catch (e) {
      console.error(`Failed to escalate lead ${lead.id}`, e);
    }
  }

  return NextResponse.json({ success: true, escalated, total: leads.length });
}
