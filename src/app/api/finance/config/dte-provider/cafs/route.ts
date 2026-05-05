/**
 * GET / POST /api/finance/config/dte-provider/cafs
 *
 * GET: lista los CAFs cargados del tenant + summary de folios disponibles
 *      (consumidos vs totales) por tipo DTE.
 * POST: sube un XML CAF, lo valida (parseCaf), valida que el RUT coincida con
 *       el RUT emisor configurado y que no haya solapamiento con CAFs ya
 *       cargados, y persiste el XML tal cual (requisito SII para conservar la
 *       firma del CAF válida).
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorized, resolveApiPerms } from "@/lib/api-auth";
import { canView, hasCapability } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { parseCaf, CafParseError } from "@/lib/dte-caf-parser";
import { getFolioSummary } from "@/modules/finance/billing/folio-tracker.service";

const MAX_CAF_SIZE = 50 * 1024;

export async function GET() {
  const ctx = await requireAuth();
  if (!ctx) return unauthorized();
  const perms = await resolveApiPerms(ctx);
  if (!canView(perms, "finance", "configuracion")) {
    return NextResponse.json(
      { success: false, error: "Sin permisos" },
      { status: 403 }
    );
  }

  const cafs = await prisma.tenantDteCaf.findMany({
    where: { tenantId: ctx.tenantId },
    orderBy: [{ dteType: "asc" }, { folioDesde: "asc" }],
    select: {
      id: true,
      dteType: true,
      folioDesde: true,
      folioHasta: true,
      rutEmisor: true,
      fechaAutorizacion: true,
      fileName: true,
      isActive: true,
      uploadedAt: true,
    },
  });

  const summary = await getFolioSummary(prisma, ctx.tenantId);

  return NextResponse.json({ success: true, data: { cafs, summary } });
}

export async function POST(request: NextRequest) {
  const ctx = await requireAuth();
  if (!ctx) return unauthorized();
  const perms = await resolveApiPerms(ctx);
  if (!hasCapability(perms, "rendicion_configure")) {
    return NextResponse.json(
      { success: false, error: "Sin permisos" },
      { status: 403 }
    );
  }

  const formData = await request.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json(
      { success: false, error: "Archivo requerido" },
      { status: 400 }
    );
  }
  if (file.size > MAX_CAF_SIZE) {
    return NextResponse.json(
      { success: false, error: "CAF demasiado grande (max 50KB)" },
      { status: 400 }
    );
  }

  const xmlBuffer = Buffer.from(await file.arrayBuffer());

  let meta;
  try {
    meta = parseCaf(xmlBuffer);
  } catch (err) {
    if (err instanceof CafParseError) {
      return NextResponse.json(
        { success: false, error: err.message },
        { status: 400 }
      );
    }
    throw err;
  }

  // Validate that RUT in CAF matches tenant's emisor RUT (if configured)
  const config = await prisma.tenantDteConfig.findUnique({
    where: { tenantId: ctx.tenantId },
  });
  if (config?.emisorRut && config.emisorRut !== meta.rutEmisor) {
    return NextResponse.json(
      {
        success: false,
        error: `RUT del CAF (${meta.rutEmisor}) no coincide con el RUT emisor configurado (${config.emisorRut}).`,
      },
      { status: 400 }
    );
  }

  // Check no overlap with existing active CAFs of same type
  const overlap = await prisma.tenantDteCaf.findFirst({
    where: {
      tenantId: ctx.tenantId,
      dteType: meta.dteType,
      isActive: true,
      folioDesde: { lte: meta.folioHasta },
      folioHasta: { gte: meta.folioDesde },
    },
  });
  if (overlap) {
    return NextResponse.json(
      {
        success: false,
        error: `El rango ${meta.folioDesde}-${meta.folioHasta} se solapa con un CAF existente (${overlap.folioDesde}-${overlap.folioHasta}).`,
      },
      { status: 400 }
    );
  }

  const caf = await prisma.tenantDteCaf.create({
    data: {
      tenantId: ctx.tenantId,
      dteType: meta.dteType,
      folioDesde: meta.folioDesde,
      folioHasta: meta.folioHasta,
      rutEmisor: meta.rutEmisor,
      fechaAutorizacion: meta.fechaAutorizacion,
      xmlData: xmlBuffer,
      fileName: file.name,
      uploadedBy: ctx.userId,
    },
    select: {
      id: true,
      dteType: true,
      folioDesde: true,
      folioHasta: true,
      rutEmisor: true,
      fechaAutorizacion: true,
      fileName: true,
      isActive: true,
      uploadedAt: true,
    },
  });

  return NextResponse.json({ success: true, data: caf }, { status: 201 });
}
