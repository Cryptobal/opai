/**
 * API Route: /api/chat/channels/provision
 * POST — Auto-create ChatChannel for each active CrmInstallation
 *         that doesn't have one.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { requireTenantModule } from '@/lib/require-module';
import { ensureInstallationChannel } from "@/lib/chat-installation-channel";

export async function POST(request: NextRequest) {
  try {
    const modCheck = await requireTenantModule('chat');
    if (!modCheck.authorized) return modCheck.response;

    const ctx = await requireAuth();
    if (!ctx) return unauthorized();

    const installations = await prisma.crmInstallation.findMany({
      where: { tenantId: ctx.tenantId, status: "active", chatEnabled: true },
      select: { id: true, name: true },
    });

    let created = 0;
    for (const inst of installations) {
      const result = await ensureInstallationChannel({
        client: prisma,
        tenantId: ctx.tenantId,
        installationId: inst.id,
        installationName: inst.name,
        activate: true,
      });
      if (result.created) created += 1;
    }

    if (created === 0) {
      return NextResponse.json({
        success: true,
        data: { created: 0 },
        meta: { message: "Todas las instalaciones ya tienen su canal de reportes" },
      });
    }

    return NextResponse.json({
      success: true,
      data: { created },
      meta: { message: `Se crearon ${created} canales de chat` },
    });
  } catch (err: any) {
    console.error("Error provisioning chat channels:", err);
    return NextResponse.json(
      { success: false, error: err.message },
      { status: 500 }
    );
  }
}
