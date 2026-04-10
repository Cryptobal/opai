/**
 * API Route: /api/portal/cliente/ticket-types
 * GET — List ticket types available for client portal (origin = "client")
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getClientSession } from "@/lib/portal-chat-auth";

export async function GET(request: NextRequest) {
  try {
    const session = getClientSession(request);
    if (!session) {
      return NextResponse.json(
        { success: false, error: "No autorizado" },
        { status: 401 },
      );
    }

    const types = await prisma.opsTicketType.findMany({
      where: {
        tenantId: session.tenantId,
        isActive: true,
        origin: "client",
      },
      select: {
        id: true,
        slug: true,
        name: true,
        description: true,
        defaultPriority: true,
        slaHours: true,
        icon: true,
        sortOrder: true,
      },
      orderBy: { sortOrder: "asc" },
    });

    return NextResponse.json({ success: true, data: types });
  } catch (error) {
    console.error("[Portal Cliente] ticket-types GET error:", error);
    return NextResponse.json(
      { success: false, error: "Error interno" },
      { status: 500 },
    );
  }
}
