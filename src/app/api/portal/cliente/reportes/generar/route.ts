/**
 * POST /api/portal/cliente/reportes/generar
 *
 * Dispara la generación on-demand de un reporte. Crea el registro en
 * `PortalClienteReporte` con status=queued, responde 202 y ejecuta la
 * generación en background via `after()`.
 */

import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requirePortalClienteAuth } from "@/lib/portal-cliente";
import { uploadFile } from "@/lib/storage";
import {
  REPORTE_TYPES,
  isReporteType,
  type ReporteType,
} from "@/lib/portal/reportes/catalog";
import { getGenerator } from "@/lib/portal/reportes/generators";

const Body = z.object({
  type: z.string(),
  params: z.object({
    desde: z.string(),
    hasta: z.string(),
    installationId: z.string().uuid().optional(),
    guardiaId: z.string().uuid().optional(),
  }),
});

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const session = await requirePortalClienteAuth(request);
    if (!session) {
      return NextResponse.json(
        { success: false, error: "No autorizado" },
        { status: 401 },
      );
    }
    if (session.isProspect) {
      return NextResponse.json(
        { success: false, error: "No disponible en modo demo" },
        { status: 403 },
      );
    }

    const raw = await request.json();
    const parsed = Body.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          error: parsed.error.issues
            .map((i) => `${i.path.join(".")}: ${i.message}`)
            .join("; "),
        },
        { status: 400 },
      );
    }

    if (!isReporteType(parsed.data.type)) {
      return NextResponse.json(
        { success: false, error: "Tipo de reporte desconocido" },
        { status: 400 },
      );
    }
    const type: ReporteType = parsed.data.type;
    const typeDef = REPORTE_TYPES[type];

    const { desde, hasta, installationId, guardiaId } = parsed.data.params;
    const desdeDate = new Date(desde);
    const hastaDate = new Date(hasta);
    if (
      Number.isNaN(desdeDate.getTime()) ||
      Number.isNaN(hastaDate.getTime()) ||
      desdeDate > hastaDate
    ) {
      return NextResponse.json(
        { success: false, error: "Rango de fechas inválido" },
        { status: 400 },
      );
    }

    const sessionInstallations = session.installationIds ?? [];
    if (sessionInstallations.length === 0) {
      return NextResponse.json(
        { success: false, error: "Sin instalaciones asignadas" },
        { status: 403 },
      );
    }

    if (installationId && !sessionInstallations.includes(installationId)) {
      return NextResponse.json(
        { success: false, error: "Instalación fuera del alcance" },
        { status: 403 },
      );
    }
    if (typeDef.requiresInstallation && !installationId) {
      return NextResponse.json(
        {
          success: false,
          error: "Este tipo de reporte requiere seleccionar una instalación",
        },
        { status: 400 },
      );
    }

    const targetInstallationIds = installationId
      ? [installationId]
      : sessionInstallations;

    const period = `${desdeDate.toISOString().slice(0, 10)}_${hastaDate.toISOString().slice(0, 10)}`;

    const reporte = await prisma.portalClienteReporte.create({
      data: {
        tenantId: session.tenantId,
        accountId: session.accountId,
        installationId: installationId ?? null,
        type,
        status: "queued",
        period,
        params: parsed.data.params,
        requestedById: session.contactId,
        requestedAt: new Date(),
        data: {},
      },
      select: { id: true },
    });

    after(async () => {
      await generateInBackground({
        reporteId: reporte.id,
        tenantId: session.tenantId,
        accountId: session.accountId,
        installationIds: targetInstallationIds,
        desde: desdeDate,
        hasta: hastaDate,
        guardiaId,
        type,
      });
    });

    return NextResponse.json(
      { success: true, data: { id: reporte.id, status: "queued" } },
      { status: 202 },
    );
  } catch (error) {
    console.error("[portal-cliente/reportes/generar] error:", error);
    return NextResponse.json(
      { success: false, error: "Error interno" },
      { status: 500 },
    );
  }
}

async function generateInBackground(opts: {
  reporteId: string;
  tenantId: string;
  accountId: string;
  installationIds: string[];
  desde: Date;
  hasta: Date;
  guardiaId?: string;
  type: ReporteType;
}) {
  const { reporteId, type, tenantId, accountId } = opts;
  try {
    await prisma.portalClienteReporte.update({
      where: { id: reporteId },
      data: { status: "generating" },
    });

    const generator = getGenerator(type);
    const result = await generator({
      tenantId,
      accountId,
      installationIds: opts.installationIds,
      desde: opts.desde,
      hasta: opts.hasta,
      guardiaId: opts.guardiaId,
    });

    const safeType = type.replace(/[^a-z0-9_-]+/gi, "_");
    const baseName = `${safeType}_${opts.desde.toISOString().slice(0, 10)}_${opts.hasta.toISOString().slice(0, 10)}`;

    let pdfUrl: string | null = null;
    let xlsxUrl: string | null = null;

    if (result.pdfBuffer) {
      const up = await uploadFile(
        result.pdfBuffer,
        `${baseName}.pdf`,
        "application/pdf",
        "portal-reportes-ondemand",
        tenantId,
      );
      pdfUrl = up.publicUrl;
    }
    if (result.xlsxBuffer) {
      const up = await uploadFile(
        result.xlsxBuffer,
        `${baseName}.xlsx`,
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "portal-reportes-ondemand",
        tenantId,
      );
      xlsxUrl = up.publicUrl;
    }

    await prisma.portalClienteReporte.update({
      where: { id: reporteId },
      data: {
        status: "ready",
        pdfUrl,
        xlsxUrl,
        generatedAt: new Date(),
        data: result.data as never,
        errorMessage: null,
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Error desconocido";
    console.error("[portal-cliente/reportes/generar] bg error:", error);
    await prisma.portalClienteReporte
      .update({
        where: { id: reporteId },
        data: { status: "error", errorMessage: message },
      })
      .catch((e) =>
        console.error(
          "[portal-cliente/reportes/generar] failed to mark error:",
          e,
        ),
      );
  }
}
