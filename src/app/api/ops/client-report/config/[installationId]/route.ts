import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import {
  assertInstallationInTenant,
  canManageClientReportConfig,
  requireClientReportAuth,
} from "@/lib/ops/client-report/auth";
import { clientReportError } from "@/lib/ops/client-report/http";

const Patch = z.object({
  enabled: z.boolean().optional(),
  frequency: z.enum(["weekly", "monthly"]).optional(),
  weekday: z.number().int().min(0).max(6).optional(),
  dayOfMonth: z.number().int().min(1).max(28).optional(),
  sendHourChile: z.number().int().min(0).max(23).optional(),
  includeAsistencia: z.boolean().optional(),
  includeCobertura: z.boolean().optional(),
  includeRondas: z.boolean().optional(),
  includeIncidentes: z.boolean().optional(),
  includeVisitas: z.boolean().optional(),
});

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ installationId: string }> }
) {
  try {
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

    return NextResponse.json({
      success: true,
      data: {
        installationId,
        installationName: inst.name,
        accountName: inst.account?.name ?? null,
        enabled: config?.enabled ?? false,
        frequency: config?.frequency ?? "weekly",
        weekday: config?.weekday ?? 0,
        dayOfMonth: config?.dayOfMonth ?? 1,
        sendHourChile: config?.sendHourChile ?? 8,
        includeAsistencia: config?.includeAsistencia ?? true,
        includeCobertura: config?.includeCobertura ?? true,
        includeRondas: config?.includeRondas ?? true,
        includeIncidentes: config?.includeIncidentes ?? true,
        includeVisitas: config?.includeVisitas ?? true,
        lastSentAt: config?.lastSentAt?.toISOString() ?? null,
        lastPeriodKey: config?.lastPeriodKey ?? null,
        canManage: canManageClientReportConfig(gate.auth.perms),
      },
    });
  } catch (error) {
    return clientReportError(error, "Error al cargar la configuración");
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ installationId: string }> }
) {
  try {
    const gate = await requireClientReportAuth();
    if (!gate.ok) return gate.response;
    const { ctx, perms } = gate.auth;
    if (!canManageClientReportConfig(perms)) {
      return NextResponse.json(
        { success: false, error: "Sin permisos para configurar el informe" },
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

    const parsed = Patch.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: "Cuerpo inválido" },
        { status: 400 }
      );
    }

    const config = await prisma.opsClientReportConfig.upsert({
      where: { installationId },
      create: {
        tenantId: ctx.tenantId,
        installationId,
        ...parsed.data,
      },
      update: parsed.data,
    });

    if (parsed.data.enabled === true) {
      await seedOperacionalRecipients(ctx.tenantId, installationId, inst.accountId);
    }

    return NextResponse.json({ success: true, data: config });
  } catch (error) {
    return clientReportError(error, "Error al guardar la configuración");
  }
}

async function seedOperacionalRecipients(
  tenantId: string,
  installationId: string,
  accountId: string | null
) {
  if (!accountId) return;
  const existing = await prisma.opsClientReportRecipient.count({
    where: { installationId, isActive: true },
  });
  if (existing > 0) return;
  const contacts = await prisma.crmContact.findMany({
    where: {
      tenantId,
      accountId,
      recibeOperacional: true,
      email: { not: null },
    },
    select: { id: true, email: true, firstName: true, lastName: true },
  });
  if (contacts.length === 0) return;
  await prisma.opsClientReportRecipient.createMany({
    data: contacts.map((c) => ({
      tenantId,
      installationId,
      contactId: c.id,
      email: c.email!,
      name: `${c.firstName} ${c.lastName}`.trim(),
      isActive: true,
    })),
  });
}
