import { NextRequest, NextResponse } from "next/server";
import React from "react";
import { renderToBuffer } from "@react-pdf/renderer";
import { prisma } from "@/lib/prisma";
import { uploadFile } from "@/lib/storage";
import { ReportePDF, ReporteData } from "@/lib/portal/report-pdf";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  try {
    // Validate cron secret
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

    // Calculate previous month period
    const now = new Date();
    const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const periodStart = prevMonth;
    const periodEnd = new Date(
      now.getFullYear(),
      now.getMonth(),
      0,
      23,
      59,
      59
    );
    const period = `${prevMonth.getFullYear()}-${String(
      prevMonth.getMonth() + 1
    ).padStart(2, "0")}`;

    // Get all active CRM accounts that have portal enabled
    const accounts = await prisma.crmAccount.findMany({
      where: { isActive: true },
      select: {
        id: true,
        tenantId: true,
        name: true,
        portalConfig: true,
        installations: {
          where: { status: "active" },
          select: { id: true, name: true },
        },
      },
    });

    let processed = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const account of accounts) {
      // Check if reportes is enabled in portalConfig
      const config = account.portalConfig as Record<string, unknown> | null;
      if (config && config.reportes === false) {
        skipped++;
        continue;
      }

      for (const installation of account.installations) {
        // Skip if report already exists for this period + installation
        const existing = await prisma.portalClienteReporte.findFirst({
          where: {
            tenantId: account.tenantId,
            accountId: account.id,
            installationId: installation.id,
            period,
          },
          select: { id: true },
        });

        if (existing) {
          skipped++;
          continue;
        }

        // Calculate KPIs for the previous month
        const rondas = await prisma.opsRondaEjecucion.findMany({
          where: {
            tenantId: account.tenantId,
            installationId: installation.id,
            scheduledAt: { gte: periodStart, lte: periodEnd },
          },
          select: { status: true },
        });

        const totalRounds = rondas.length;
        const completedRounds = rondas.filter(
          (r) => r.status === "completada"
        ).length;
        const compliance =
          totalRounds > 0
            ? Math.round((completedRounds / totalRounds) * 100)
            : 0;

        // Asistencia: slots with status "presente" / total slots in period
        const totalDays = await prisma.opsAsistenciaDiaria.count({
          where: {
            tenantId: account.tenantId,
            installationId: installation.id,
            date: { gte: periodStart, lte: periodEnd },
          },
        });
        const presenteDays = await prisma.opsAsistenciaDiaria.count({
          where: {
            tenantId: account.tenantId,
            installationId: installation.id,
            date: { gte: periodStart, lte: periodEnd },
            attendanceStatus: "presente",
          },
        });
        const asistencia =
          totalDays > 0 ? Math.round((presenteDays / totalDays) * 100) : 0;

        // Tickets count for this installation
        const tickets = await prisma.opsTicket.count({
          where: {
            tenantId: account.tenantId,
            installationId: installation.id,
            createdAt: { gte: periodStart, lte: periodEnd },
          },
        });

        // Alertas count
        const alertas = await prisma.opsAlertaRonda.count({
          where: {
            tenantId: account.tenantId,
            installationId: installation.id,
            createdAt: { gte: periodStart, lte: periodEnd },
          },
        });

        const reporteData: ReporteData = {
          period,
          installationName: installation.name,
          accountName: account.name,
          compliance,
          completedRounds,
          totalRounds,
          asistencia,
          tickets,
          alertas,
        };

        // Generate PDF
        let pdfUrl: string | null = null;
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const element = React.createElement(ReportePDF, { data: reporteData }) as any;
          const pdfBuffer = await renderToBuffer(element);
          const fileName = `reporte-${account.id}-${installation.id}-${period}.pdf`;
          const uploadResult = await uploadFile(
            Buffer.from(pdfBuffer),
            fileName,
            "application/pdf",
            "portal-reportes"
          );
          pdfUrl = uploadResult.publicUrl || null;
        } catch (pdfError) {
          console.error(
            `[CRON portal-reportes] PDF generation failed for ${account.id}/${installation.id}:`,
            pdfError
          );
          // Continue — create record with null pdfUrl so data is still stored
        }

        // Create the report record
        await prisma.portalClienteReporte.create({
          data: {
            tenantId: account.tenantId,
            accountId: account.id,
            installationId: installation.id,
            period,
            pdfUrl,
            generatedAt: new Date(),
            data: reporteData as unknown as object,
          },
        });

        processed++;
      }
    }

    return NextResponse.json({
      success: true,
      data: { period, processed, skipped, errors },
    });
  } catch (error) {
    console.error("[CRON portal-reportes]", error);
    return NextResponse.json(
      { success: false, error: "Error interno" },
      { status: 500 }
    );
  }
}
