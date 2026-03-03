import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorized, ensureModuleAccess } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { createOpsAuditLog } from "@/lib/ops";

type DotacionSnapshotItem = {
  positionId: string;
  puestoTrabajoId: string;
  puestoTrabajoName: string;
  customName: string | null;
  cargoId: string;
  cargoName: string;
  rolId: string;
  rolName: string;
  shiftStart: string;
  shiftEnd: string;
  weekdays: string[];
  requiredGuards: number;
  baseSalary: number;
  netSalary: number | null;
};

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbiddenMod = await ensureModuleAccess(ctx, "cpq");
    if (forbiddenMod) return forbiddenMod;

    const quote = await prisma.cpqQuote.findFirst({
      where: { id, tenantId: ctx.tenantId },
      include: {
        positions: {
          include: {
            puestoTrabajo: { select: { id: true, name: true } },
            cargo: { select: { id: true, name: true } },
            rol: { select: { id: true, name: true } },
          },
          orderBy: { createdAt: "asc" },
        },
      },
    });

    if (!quote) {
      return NextResponse.json(
        { success: false, error: "Cotización no encontrada" },
        { status: 404 }
      );
    }

    if (!quote.installationId) {
      return NextResponse.json(
        {
          success: false,
          error: "La cotización debe estar vinculada a una instalación",
        },
        { status: 400 }
      );
    }

    if (!quote.positions.length) {
      return NextResponse.json(
        { success: false, error: "La cotización no tiene puestos para enviar" },
        { status: 400 }
      );
    }

    const installation = await prisma.crmInstallation.findFirst({
      where: { id: quote.installationId, tenantId: ctx.tenantId },
      select: {
        id: true,
        name: true,
        teMontoClp: true,
        metadata: true,
      },
    });

    if (!installation) {
      return NextResponse.json(
        { success: false, error: "Instalación no encontrada" },
        { status: 404 }
      );
    }

    const dotacionSnapshot: DotacionSnapshotItem[] = quote.positions.map((pos) => ({
      positionId: pos.id,
      puestoTrabajoId: pos.puestoTrabajoId,
      puestoTrabajoName: pos.puestoTrabajo.name,
      customName: pos.customName ?? null,
      cargoId: pos.cargoId,
      cargoName: pos.cargo.name,
      rolId: pos.rolId,
      rolName: pos.rol.name,
      shiftStart: pos.startTime,
      shiftEnd: pos.endTime,
      weekdays: pos.weekdays,
      requiredGuards: pos.numGuards,
      baseSalary: Number(pos.baseSalary),
      netSalary: pos.netSalary ? Number(pos.netSalary) : null,
    }));

    const baseMetadata =
      installation.metadata && typeof installation.metadata === "object" && !Array.isArray(installation.metadata)
        ? (installation.metadata as Record<string, unknown>)
        : {};

    const metadata = {
      ...baseMetadata,
      dotacionActiva: {
        source: "cpq_quote",
        sourceQuoteId: quote.id,
        sourceQuoteCode: quote.code,
        updatedAt: new Date().toISOString(),
        updatedBy: ctx.userId,
        items: dotacionSnapshot,
      },
    };

    const createData = quote.positions.map((pos) => ({
      tenantId: ctx.tenantId,
      installationId: installation.id,
      name: [pos.cargo.name, pos.puestoTrabajo.name].filter(Boolean).join(" - ") || pos.puestoTrabajo.name,
      puestoTrabajoId: pos.puestoTrabajoId,
      cargoId: pos.cargoId,
      rolId: pos.rolId,
      shiftStart: pos.startTime,
      shiftEnd: pos.endTime,
      weekdays: pos.weekdays,
      requiredGuards: pos.numGuards,
      teMontoClp: installation.teMontoClp,
      active: true,
      createdBy: ctx.userId,
    }));

    const result = await prisma.$transaction(async (tx) => {
      const deleted = await tx.opsPuestoOperativo.deleteMany({
        where: {
          tenantId: ctx.tenantId,
          installationId: installation.id,
        },
      });

      const created = await tx.opsPuestoOperativo.createMany({
        data: createData,
      });

      await tx.crmInstallation.update({
        where: { id: installation.id },
        data: { metadata },
      });

      return { deleted: deleted.count, created: created.count };
    });

    await createOpsAuditLog(
      ctx,
      "cpq.quote.send_dotacion_to_installation",
      "crm_installation",
      installation.id,
      {
        quoteId: quote.id,
        quoteCode: quote.code,
        deletedPuestos: result.deleted,
        createdPuestos: result.created,
      }
    );

    return NextResponse.json({
      success: true,
      data: {
        installationId: installation.id,
        installationName: installation.name,
        quoteId: quote.id,
        quoteCode: quote.code,
        deletedPuestos: result.deleted,
        createdPuestos: result.created,
      },
    });
  } catch (error) {
    console.error("Error sending quote staffing to installation:", error);
    return NextResponse.json(
      { success: false, error: "No se pudo enviar la dotación a instalación" },
      { status: 500 }
    );
  }
}
