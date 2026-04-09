import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * CRON: /api/cron/rondas/archivar-alertas
 *
 * Archives unresolved alerts older than 48 hours automatically.
 * Panic alerts are NEVER auto-archived.
 * Runs every hour via Vercel Cron.
 * Protected with CRON_SECRET env var.
 */
export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET;
    if (!cronSecret && process.env.NODE_ENV === "production") {
      return NextResponse.json(
        { success: false, error: "CRON_SECRET not configured" },
        { status: 500 },
      );
    }
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 },
      );
    }

    const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000); // 48 hours ago

    // Get all tenants with unresolved old alerts
    const tenants = await prisma.tenant.findMany({
      where: { active: true },
      select: { id: true },
    });

    let totalArchived = 0;

    for (const tenant of tenants) {
      const result = await prisma.opsAlertaRonda.updateMany({
        where: {
          tenantId: tenant.id,
          resuelta: false,
          archivedAt: null,
          createdAt: { lt: cutoff },
          // NEVER auto-archive panic alerts
          tipo: { notIn: ["panico"] },
        },
        data: {
          archivedAt: new Date(),
        },
      });
      totalArchived += result.count;
    }

    return NextResponse.json({
      success: true,
      data: {
        tenantsProcessed: tenants.length,
        totalArchived,
        cutoff: cutoff.toISOString(),
      },
    });
  } catch (error) {
    console.error("[CRON] archivar-alertas error:", error);
    return NextResponse.json(
      { success: false, error: "Error interno" },
      { status: 500 },
    );
  }
}
