import { NextRequest, NextResponse } from "next/server";
import { getTenantCompanyConfig } from "@/lib/tenant-config";
import { lookupReportQr, listAssignableInstallations } from "@/lib/incidentes-instalacion/report-qr";
import { resolveReportQrStaffActor } from "@/lib/incidentes-instalacion/report-qr-staff";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const lookup = await lookupReportQr(token);
  if (lookup.kind === "missing") {
    return NextResponse.json(
      { success: false, error: "Este QR ya no está vigente.", code: "TOKEN_INVALID" },
      { status: 404 },
    );
  }

  const tenantId =
    lookup.kind === "retired"
      ? null
      : lookup.qr.tenantId;
  const tenantName = lookup.tenantName;
  const serialLabel = lookup.kind === "retired" ? lookup.serialLabel : lookup.qr.serialLabel;
  const status =
    lookup.kind === "retired" ? "retired" : lookup.kind === "unassigned" ? "unassigned" : "assigned";

  const cfg = tenantId ? await getTenantCompanyConfig(tenantId) : null;
  const displayName = cfg?.commercialName || tenantName;
  const tenantMonogram = displayName.replace(/[^A-Za-zÁÉÍÓÚÑáéíóúñ]/g, "").slice(0, 2).toUpperCase() || "OP";

  const actor = await resolveReportQrStaffActor(request);
  const sameTenant = Boolean(actor && tenantId && actor.tenantId === tenantId);
  const canAssign = Boolean(
    sameTenant &&
      status !== "retired" &&
      (actor?.kind === "device" || (actor?.kind === "erp" && actor.canEdit)),
  );

  let installations: Awaited<ReturnType<typeof listAssignableInstallations>> = [];
  if (canAssign && actor?.kind === "erp" && tenantId) {
    installations = await listAssignableInstallations({ tenantId, take: 80 });
  }

  return NextResponse.json({
    success: true,
    data: {
      status,
      serialLabel,
      tenantName: displayName,
      tenantMonogram,
      tenantLogoUrl: cfg?.brandingLogoFull || cfg?.logoUrl || cfg?.brandingLogoDark || cfg?.brandingLogoIcon || null,
      installation:
        lookup.kind === "assigned"
          ? { id: lookup.installation.id, name: lookup.installation.name }
          : null,
      canAssign,
      actor: sameTenant ? actor?.kind ?? null : null,
      deviceInstallation:
        sameTenant && actor?.kind === "device"
          ? {
              id: actor.installationId,
              name: actor.installationName,
              hasCoords: actor.hasCoords,
            }
          : null,
      installations,
    },
  });
}
