/** GET /api/crm/deals/[id]/licitacion-sync — estado del evento Calendar de la licitación. */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { requireCrmView } from "@/lib/api-auth-crm";
import { requireTenantModule } from "@/lib/require-module";
import {
  isGoogleConnectReason,
  sanitizeSyncReason,
} from "@/modules/agenda/agenda-sync-reason";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const modCheck = await requireTenantModule("crm");
    if (!modCheck.authorized) return modCheck.response;

    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await requireCrmView(ctx, "deals");
    if (forbidden) return forbidden;

    const { id } = await params;
    const link = await prisma.agendaEventLink.findFirst({
      where: { tenantId: ctx.tenantId, sourceType: "licitacion", sourceId: id },
      select: { syncStatus: true, htmlLink: true, lastError: true },
    });
    if (!link) {
      return NextResponse.json({ success: true, data: null });
    }
    const lastError = sanitizeSyncReason(link.lastError);
    return NextResponse.json({
      success: true,
      data: {
        syncStatus: link.syncStatus,
        htmlLink: link.htmlLink,
        lastError,
        needsGoogleConnect:
          isGoogleConnectReason(link.lastError) || isGoogleConnectReason(lastError),
      },
    });
  } catch (error) {
    console.error("[crm/deals/licitacion-sync] GET:", error);
    return NextResponse.json({ success: false, error: "Error al consultar sync" }, { status: 500 });
  }
}
