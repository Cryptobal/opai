import { NextRequest, NextResponse } from "next/server";
import {
  assertInstallationInTenant,
  requireClientReportAuth,
} from "@/lib/ops/client-report/auth";
import { prisma } from "@/lib/prisma";
import {
  collectDigestReport,
  periodForFrequency,
  renderDigestPdf,
  type ReportFrequency,
} from "@/lib/ops/client-report";

/**
 * GET — PDF del digest que se enviaría (período cerrado según frecuencia).
 * Este es el preview fiel de lo que manda el cron.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ installationId: string }> }
) {
  const gate = await requireClientReportAuth();
  if (!gate.ok) return gate.response;
  const { ctx } = gate.auth;
  const { installationId } = await params;
  const inst = await assertInstallationInTenant(ctx.tenantId, installationId);
  if (!inst) {
    return NextResponse.json(
      { success: false, error: "Instalación no encontrada" },
      { status: 404 }
    );
  }

  const config = await prisma.opsClientReportConfig.findUnique({
    where: { installationId },
  });
  const frequency = (config?.frequency ??
    request.nextUrl.searchParams.get("frequency") ??
    "weekly") as ReportFrequency;
  const period = periodForFrequency(
    frequency === "monthly" ? "monthly" : "weekly"
  );

  const data = await collectDigestReport({
    tenantId: ctx.tenantId,
    installationId,
    period,
    sections: config
      ? {
          includeAsistencia: config.includeAsistencia,
          includeCobertura: config.includeCobertura,
          includeRondas: config.includeRondas,
          includeIncidentes: config.includeIncidentes,
          includeVisitas: config.includeVisitas,
        }
      : undefined,
  });

  const pdf = await renderDigestPdf(data);
  const filename = `informe-operativo-${period.key.replace(/[^a-zA-Z0-9_-]/g, "_")}.pdf`;
  return new NextResponse(new Uint8Array(pdf), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${filename}"`,
      "Cache-Control": "no-store",
      "X-Report-Period": period.label,
    },
  });
}
