import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { ensureOpsAccess } from "@/lib/ops";
import { sendControlNocturnoEmail } from "@/lib/control-nocturno-email";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type RouteParams = { params: Promise<{ id: string }> };

/**
 * POST — Enviar email de prueba con PDF adjunto a operaciones@gard.cl
 */
export async function POST(_request: NextRequest, { params }: RouteParams) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await ensureOpsAccess(ctx);
    if (forbidden) return forbidden;

    const { id } = await params;

    const reporte = await prisma.opsControlNocturno.findFirst({
      where: { id, tenantId: ctx.tenantId },
      include: {
        instalaciones: {
          select: { statusInstalacion: true },
        },
      },
    });

    if (!reporte) {
      return NextResponse.json({ success: false, error: "Reporte no encontrado" }, { status: 404 });
    }

    const baseUrl = process.env.NEXTAUTH_URL || "http://localhost:3000";

    // Generate PDF
    let pdfBuffer: Uint8Array | undefined;
    try {
      const { chromium } = await import("playwright-core");
      const chromiumPkg = (await import("@sparticuz/chromium")).default;

      // Re-fetch full data for PDF generation inline
      const fullReporte = await prisma.opsControlNocturno.findFirst({
        where: { id, tenantId: ctx.tenantId },
        include: {
          instalaciones: {
            include: {
              guardias: { orderBy: { createdAt: "asc" } },
              rondas: { orderBy: { rondaNumber: "asc" } },
            },
            orderBy: { orderIndex: "asc" },
          },
        },
      });

      if (fullReporte) {
        // Build a minimal PDF via the export-pdf route logic (call it internally)
        const pdfUrl = `${baseUrl}/api/ops/control-nocturno/${id}/export-pdf`;
        const pdfRes = await fetch(pdfUrl, {
          headers: { cookie: _request.headers.get("cookie") || "" },
        });
        if (pdfRes.ok) {
          pdfBuffer = new Uint8Array(await pdfRes.arrayBuffer());
        }
      }
    } catch (pdfErr) {
      console.warn("[TEST_EMAIL] Could not generate PDF:", pdfErr);
    }

    const emailData = {
      reporteId: id,
      date: reporte.date.toISOString().slice(0, 10),
      centralOperatorName: reporte.centralOperatorName,
      centralLabel: reporte.centralLabel,
      totalInstalaciones: reporte.instalaciones.length,
      novedades: reporte.instalaciones.filter((i) => i.statusInstalacion === "novedad").length,
      criticos: reporte.instalaciones.filter((i) => i.statusInstalacion === "critico").length,
      generalNotes: reporte.generalNotes,
      baseUrl,
    };

    const result = await sendControlNocturnoEmail(emailData, pdfBuffer);

    if (result.ok) {
      return NextResponse.json({
        success: true,
        message: "Email de prueba enviado a operaciones@gard.cl",
        pdfAttached: !!pdfBuffer,
      });
    } else {
      return NextResponse.json(
        { success: false, error: result.error || "Error al enviar" },
        { status: 500 },
      );
    }
  } catch (error) {
    console.error("[TEST_EMAIL] Error:", error);
    return NextResponse.json(
      { success: false, error: "Error al enviar email de prueba" },
      { status: 500 },
    );
  }
}
