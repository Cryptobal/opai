import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ensureInstallationAccess, requirePortalClienteAuth } from "@/lib/portal-cliente";
import { safeAccessControlQuery } from "@/lib/access-control/safe-query";

/**
 * Read-only listing of record types available for an installation,
 * scoped to a portal-cliente session. Returns enough info for the
 * cliente components (preregistration, whitelist, history, live) to
 * render correct labels/icons for both built-in and custom types
 * without exposing the admin endpoint.
 *
 * Shape mirrors the relevant subset of `/api/access-control/config`
 * — only what the cliente needs.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ installationId: string }> },
) {
  try {
    const session = await requirePortalClienteAuth(request);
    if (!session) {
      return NextResponse.json({ success: false, error: "No autorizado" }, { status: 401 });
    }

    const { installationId } = await params;
    if (!(await ensureInstallationAccess(session, installationId))) {
      return NextResponse.json({ success: false, error: "Acceso denegado" }, { status: 403 });
    }

    const [config, customRecordTypes] = await Promise.all([
      safeAccessControlQuery(
        () => prisma.accessControlConfig.findUnique({
          where: { installationId },
          select: {
            enabledRecordTypes: true,
            recordTypeLabels: true,
            recordTypeIcons: true,
          },
        }),
        null,
      ),
      safeAccessControlQuery(
        () => prisma.accessControlRecordType.findMany({
          where: { installationId, isActive: true },
          orderBy: { orderIdx: "asc" },
          select: {
            id: true, key: true, label: true, icon: true,
            defaultFields: true, orderIdx: true, isActive: true,
          },
        }),
        [],
      ),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        enabledRecordTypes: config?.enabledRecordTypes ?? [
          "visit", "provider", "vehicle", "staff", "delivery",
        ],
        recordTypeLabels: config?.recordTypeLabels ?? {},
        recordTypeIcons: config?.recordTypeIcons ?? {},
        customRecordTypes: customRecordTypes ?? [],
      },
    });
  } catch (error) {
    console.error("[PortalCliente] Error listing record types:", error);
    return NextResponse.json(
      { success: false, error: "Error al cargar tipos de registro" },
      { status: 500 },
    );
  }
}
