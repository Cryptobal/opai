/**
 * API Route: /api/portal/cliente/tickets
 * GET — List tickets for the client's account installations.
 * POST — Create a new ticket from the portal.
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
        { status: 401 }
      );
    }

    const { searchParams } = request.nextUrl;
    const statusFilter = searchParams.get("status");
    const installationIdFilter = searchParams.get("installationId");

    // Resolve installation IDs authorized for this account
    let installationIds: string[];

    if (installationIdFilter) {
      const inst = await prisma.crmInstallation.findFirst({
        where: {
          id: installationIdFilter,
          accountId: session.accountId,
          tenantId: session.tenantId,
        },
        select: { id: true },
      });
      if (!inst) {
        return NextResponse.json(
          { success: false, error: "Instalacion no encontrada" },
          { status: 404 }
        );
      }
      installationIds = [installationIdFilter];
    } else {
      const installations = await prisma.crmInstallation.findMany({
        where: {
          accountId: session.accountId,
          tenantId: session.tenantId,
        },
        select: { id: true },
      });
      installationIds = installations.map((i) => i.id);
    }

    if (installationIds.length === 0) {
      return NextResponse.json({ success: true, data: [] });
    }

    const tickets = await prisma.opsTicket.findMany({
      where: {
        tenantId: session.tenantId,
        installationId: { in: installationIds },
        ...(statusFilter ? { status: statusFilter } : {}),
      },
      select: {
        id: true,
        code: true,
        status: true,
        priority: true,
        title: true,
        description: true,
        assignedTeam: true,
        installationId: true,
        source: true,
        slaDueAt: true,
        resolvedAt: true,
        closedAt: true,
        tags: true,
        createdAt: true,
        ticketType: {
          select: { name: true, slug: true },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    return NextResponse.json({ success: true, data: tickets });
  } catch (error) {
    console.error("[Portal Cliente] tickets GET error:", error);
    return NextResponse.json(
      { success: false, error: "Error interno" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = getClientSession(request);
    if (!session) {
      return NextResponse.json(
        { success: false, error: "No autorizado" },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { installationId, title, description, priority, ticketTypeId } = body;

    if (!installationId || !title) {
      return NextResponse.json(
        { success: false, error: "installationId y title son requeridos" },
        { status: 400 }
      );
    }

    // Verify installationId belongs to session.accountId
    const inst = await prisma.crmInstallation.findFirst({
      where: {
        id: installationId,
        accountId: session.accountId,
        tenantId: session.tenantId,
      },
      select: { id: true },
    });

    if (!inst) {
      return NextResponse.json(
        { success: false, error: "Instalacion no encontrada o sin acceso" },
        { status: 403 }
      );
    }

    const code = `TKT-${Date.now().toString(36).toUpperCase()}`;

    const ticket = await prisma.opsTicket.create({
      data: {
        tenantId: session.tenantId,
        code,
        title,
        description: description ?? null,
        priority: priority ?? "p3",
        status: "open",
        assignedTeam: "operaciones",
        source: "portal_cliente",
        reportedBy: session.contactId,
        installationId,
        ...(ticketTypeId ? { ticketTypeId } : {}),
      },
      select: {
        id: true,
        code: true,
        status: true,
        priority: true,
        title: true,
        description: true,
        assignedTeam: true,
        installationId: true,
        source: true,
        createdAt: true,
        ticketType: {
          select: { name: true, slug: true },
        },
      },
    });

    return NextResponse.json({ success: true, data: ticket }, { status: 201 });
  } catch (error) {
    console.error("[Portal Cliente] tickets POST error:", error);
    return NextResponse.json(
      { success: false, error: "Error interno" },
      { status: 500 }
    );
  }
}
