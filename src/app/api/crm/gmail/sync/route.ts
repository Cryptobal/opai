/**
 * API Route: /api/crm/gmail/sync
 * GET - Sincroniza correos recientes de Gmail (wrapper fino).
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireTenantModule } from "@/lib/require-module";
import { syncGmailAccount } from "@/modules/crm/email/gmail-sync.service";

export async function GET(request: NextRequest) {
  try {
    const modCheck = await requireTenantModule("crm");
    if (!modCheck.authorized) return modCheck.response;

    const session = await auth();
    if (!session?.user?.tenantId) {
      return NextResponse.json({ success: false, error: "No autorizado" }, { status: 401 });
    }

    const maxResults = Math.min(
      Math.max(Number(request.nextUrl.searchParams.get("max") || "20"), 1),
      100,
    );

    const emailAccount = await prisma.crmEmailAccount.findFirst({
      where: {
        tenantId: session.user.tenantId,
        userId: session.user.id,
        provider: "gmail",
        status: "active",
      },
    });
    if (!emailAccount) {
      return NextResponse.json({ success: false, error: "Gmail no conectado" }, { status: 400 });
    }

    const result = await syncGmailAccount({
      tenantId: session.user.tenantId,
      emailAccountId: emailAccount.id,
      maxResults,
      createdByUserId: session.user.id,
    });

    return NextResponse.json({
      success: true,
      count: result.syncedCount,
      fetched: result.fetched,
    });
  } catch (error) {
    console.error("Error syncing Gmail:", error);
    return NextResponse.json(
      { success: false, error: "Failed to sync Gmail" },
      { status: 500 },
    );
  }
}
