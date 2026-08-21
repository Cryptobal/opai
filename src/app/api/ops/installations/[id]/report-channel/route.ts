import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { getCanonicalSiteUrl } from "@/lib/emails/site-url";
import { IncidenteError, publicErrorResponse } from "@/lib/incidentes-instalacion/errors";
import {
  disableReportChannel,
  enableReportChannel,
  rotateReportToken,
} from "@/lib/incidentes-instalacion/service";

export const dynamic = "force-dynamic";

async function loadInstallation(tenantId: string, id: string) {
  return prisma.crmInstallation.findFirst({
    where: { id, tenantId },
    select: {
      id: true,
      name: true,
      address: true,
      commune: true,
      city: true,
      lat: true,
      lng: true,
      publicReportEnabled: true,
      publicReportToken: true,
      publicReportTokenRotatedAt: true,
      marcacionCode: true,
    },
  });
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await requireAuth();
  if (!ctx) return unauthorized();
  const { id } = await params;
  const inst = await loadInstallation(ctx.tenantId, id);
  if (!inst) {
    return NextResponse.json({ success: false, error: "Instalación no encontrada" }, { status: 404 });
  }
  const publicUrl = inst.publicReportToken
    ? `${getCanonicalSiteUrl()}/r/${inst.publicReportToken}`
    : null;
  return NextResponse.json({
    success: true,
    data: {
      enabled: inst.publicReportEnabled,
      hasCoords: inst.lat != null && inst.lng != null,
      publicUrl,
      rotatedAt: inst.publicReportTokenRotatedAt,
      installationName: inst.name,
      address: [inst.address, inst.commune, inst.city].filter(Boolean).join(", ") || null,
      installationCode: inst.marcacionCode,
    },
  });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await requireAuth();
  if (!ctx) return unauthorized();
  const { id } = await params;
  try {
    const body = await request.json();
    const action = String(body.action ?? "");
    if (action === "enable") {
      await enableReportChannel({ tenantId: ctx.tenantId, installationId: id, actorId: ctx.userId });
    } else if (action === "disable") {
      await disableReportChannel({ tenantId: ctx.tenantId, installationId: id, actorId: ctx.userId });
    } else if (action === "rotate") {
      await rotateReportToken({ tenantId: ctx.tenantId, installationId: id, actorId: ctx.userId });
    } else {
      return NextResponse.json({ success: false, error: "Acción no válida" }, { status: 400 });
    }
    const inst = await loadInstallation(ctx.tenantId, id);
    const publicUrl = inst?.publicReportToken
      ? `${getCanonicalSiteUrl()}/r/${inst.publicReportToken}`
      : null;
    return NextResponse.json({
      success: true,
      data: {
        enabled: inst?.publicReportEnabled ?? false,
        publicUrl,
        rotatedAt: inst?.publicReportTokenRotatedAt ?? null,
      },
    });
  } catch (err) {
    if (err instanceof IncidenteError) {
      return NextResponse.json(publicErrorResponse(err), { status: err.httpStatus });
    }
    console.error("[report-channel]", err);
    return NextResponse.json({ success: false, error: "No se pudo actualizar el canal" }, { status: 500 });
  }
}
