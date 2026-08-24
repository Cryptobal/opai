import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import {
  assertInstallationInTenant,
  canManageClientReportConfig,
  requireClientReportAuth,
} from "@/lib/ops/client-report/auth";
import {
  buildAndSendDigest,
  collectDigestReport,
  periodForFrequency,
  type ReportFrequency,
} from "@/lib/ops/client-report";

const Body = z.object({
  email: z.string().email().optional(),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ installationId: string }> }
) {
  const gate = await requireClientReportAuth();
  if (!gate.ok) return gate.response;
  const { ctx, perms } = gate.auth;
  if (!canManageClientReportConfig(perms)) {
    return NextResponse.json(
      { success: false, error: "Sin permisos" },
      { status: 403 }
    );
  }
  const { installationId } = await params;
  const inst = await assertInstallationInTenant(ctx.tenantId, installationId);
  if (!inst) {
    return NextResponse.json(
      { success: false, error: "Instalación no encontrada" },
      { status: 404 }
    );
  }

  const parsed = Body.safeParse(await request.json().catch(() => ({})));
  const override = parsed.success ? parsed.data.email : undefined;

  let to: string[];
  if (override) {
    to = [override];
  } else {
    const recipients = await prisma.opsClientReportRecipient.findMany({
      where: { installationId, isActive: true },
      select: { email: true },
    });
    to = recipients.map((r) => r.email);
  }
  if (to.length === 0) {
    return NextResponse.json(
      {
        success: false,
        error: "No hay destinatarios. Marca contactos o agrega un email.",
      },
      { status: 400 }
    );
  }

  const config = await prisma.opsClientReportConfig.findUnique({
    where: { installationId },
  });
  const frequency = (config?.frequency ?? "weekly") as ReportFrequency;
  const period = periodForFrequency(frequency);
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

  const sent = await buildAndSendDigest({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    installationId,
    accountId: inst.accountId,
    periodKey: period.key,
    data,
    to,
    isTest: true,
  });

  if (!sent.ok) {
    return NextResponse.json(
      { success: false, error: sent.error ?? "No se pudo enviar" },
      { status: 502 }
    );
  }
  return NextResponse.json({ success: true, sentTo: to, period: period.label });
}
