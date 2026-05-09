import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendEmailWithRetry } from "@/lib/email-retry";
import { renderAccessControlReport } from "@/lib/access-control/report";
import { requireAccessControlAuth } from "@/lib/access-control/auth";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ installationId: string }> }
) {
  try {
    const { installationId } = await params;
    const authCtx = await requireAccessControlAuth(request, installationId);
    if (!authCtx) {
      return NextResponse.json(
        { success: false, error: "No autorizado" },
        { status: 401 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const overrideEmail = body?.email as string | undefined;

    const installation = await prisma.crmInstallation.findUnique({
      where: { id: installationId },
      select: { tenantId: true, name: true },
    });
    if (!installation) {
      return NextResponse.json(
        { success: false, error: "Instalación no encontrada" },
        { status: 404 }
      );
    }

    const config = await prisma.accessControlConfig.findUnique({
      where: { installationId },
      select: { autoReportSchedule: true },
    });
    const schedule = config?.autoReportSchedule || "daily";

    let to: string[];
    if (overrideEmail) {
      to = [overrideEmail];
    } else {
      const recipients = await prisma.accessControlReportRecipient.findMany({
        where: { installationId, isActive: true },
        select: { email: true },
      });
      if (recipients.length === 0) {
        return NextResponse.json(
          {
            success: false,
            error: "No hay destinatarios activos. Agrega al menos uno.",
          },
          { status: 400 }
        );
      }
      to = recipients.map((r) => r.email);
    }

    const { html, periodLabel } = await renderAccessControlReport({
      tenantId: installation.tenantId,
      installationId,
      installationName: installation.name,
      schedule,
      now: new Date(),
    });

    await sendEmailWithRetry(
      {
        from: "Opai <noreply@opai.cl>",
        to,
        subject: `[Prueba] Reporte ${periodLabel} de control de acceso — ${installation.name}`,
        html,
      },
      {
        tenantId: installation.tenantId,
        purpose: "access_control_report_test",
        refId: installationId,
      }
    );

    return NextResponse.json({ success: true, sentTo: to });
  } catch (error) {
    console.error("[AccessControl] Error sending test report:", error);
    return NextResponse.json(
      { success: false, error: "Error al enviar reporte de prueba" },
      { status: 500 }
    );
  }
}
