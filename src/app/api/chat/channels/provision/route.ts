/**
 * API Route: /api/chat/channels/provision
 * POST — Auto-create ChatChannel for each active CrmInstallation
 *         that doesn't have one.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { requireTenantModule } from '@/lib/require-module';

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

    const existingChannels = await prisma.chatChannel.findMany({
      where: {
        tenantId: ctx.tenantId,
        channelType: "INSTALLATION",
      },
      select: { installationId: true, subType: true },
    });

    const existingSet = new Set(
      existingChannels.map((c) => `${c.installationId}:${c.subType}`)
    );

    const toCreate: Array<{
      tenantId: string;
      installationId: string;
      subType: string;
      name: string;
    }> = [];

    for (const inst of installations) {
      if (!existingSet.has(`${inst.id}:reportes`)) {
        toCreate.push({
          tenantId: ctx.tenantId,
          installationId: inst.id,
          subType: "reportes",
          name: `${inst.name} - Reportes`,
        });
      }
    }

    if (toCreate.length === 0) {
      return NextResponse.json({
        success: true,
        data: { created: 0 },
        meta: { message: "Todas las instalaciones ya tienen su canal de reportes" },
      });
    }

    const created = await prisma.chatChannel.createMany({
      data: toCreate,
      skipDuplicates: true,
    });

    return NextResponse.json({
      success: true,
      data: { created: created.count },
      meta: { message: `Se crearon ${created.count} canales de chat` },
    });
  } catch (err: any) {
    console.error("Error provisioning chat channels:", err);
    return NextResponse.json(
      { success: false, error: err.message },
      { status: 500 }
    );
  }
}
