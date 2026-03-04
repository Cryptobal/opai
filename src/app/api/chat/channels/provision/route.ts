/**
 * API Route: /api/chat/channels/provision
 * POST — Auto-create ChatChannel for each active CrmInstallation
 *         that doesn't have one.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";

export async function POST(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();

    // Find all active installations for the tenant that don't have a chat channel
    const installationsWithoutChannel = await prisma.crmInstallation.findMany({
      where: {
        tenantId: ctx.tenantId,
        isActive: true,
        chatChannel: null,
      },
      select: {
        id: true,
        name: true,
      },
    });

    if (installationsWithoutChannel.length === 0) {
      return NextResponse.json({
        success: true,
        data: { created: 0 },
        meta: { message: "Todas las instalaciones ya tienen canal de chat" },
      });
    }

    // Create channels for each installation
    const created = await prisma.chatChannel.createMany({
      data: installationsWithoutChannel.map((inst) => ({
        tenantId: ctx.tenantId,
        installationId: inst.id,
        name: inst.name,
      })),
      skipDuplicates: true,
    });

    return NextResponse.json({
      success: true,
      data: { created: created.count },
      meta: {
        message: `Se crearon ${created.count} canales de chat`,
      },
    });
  } catch (err: any) {
    console.error("Error provisioning chat channels:", err);
    return NextResponse.json(
      { success: false, error: err.message },
      { status: 500 }
    );
  }
}
