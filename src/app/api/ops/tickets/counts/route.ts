import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { ensureOpsAccess } from "@/lib/ops";

export const dynamic = "force-dynamic";

const ACTIVE_STATUSES = [
  "open",
  "in_progress",
  "waiting",
  "pending_approval",
] as const;

type OriginFilter = "internal" | "guard" | "client" | null;

function parseOrigin(v: string | null): OriginFilter {
  if (v === "internal" || v === "guard" || v === "client") return v;
  return null;
}

function originWhere(type: OriginFilter): Prisma.OpsTicketWhereInput {
  if (type === "internal") {
    return {
      OR: [
        { ticketType: { origin: { in: ["internal", "both"] } } },
        { ticketTypeId: null },
      ],
    };
  }
  if (type === "guard") {
    return {
      OR: [
        { ticketType: { origin: { in: ["guard", "both"] } } },
        { ticketTypeId: null },
      ],
    };
  }
  if (type === "client") {
    return {
      OR: [
        { ticketType: { origin: "client" } },
        { source: "portal_cliente" },
      ],
    };
  }
  return {};
}

export async function GET(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await ensureOpsAccess(ctx);
    if (forbidden) return forbidden;

    const type = parseOrigin(new URL(request.url).searchParams.get("type"));
    const tenantWhere: Prisma.OpsTicketWhereInput = { tenantId: ctx.tenantId };
    const filteredWhere: Prisma.OpsTicketWhereInput = {
      ...tenantWhere,
      ...originWhere(type),
    };

    const [
      total,
      statusGroup,
      priorityGroup,
      active,
      slaBreached,
      originAll,
      originInternal,
      originGuard,
      originClient,
    ] = await Promise.all([
      prisma.opsTicket.count({ where: filteredWhere }),
      prisma.opsTicket.groupBy({
        by: ["status"],
        where: filteredWhere,
        _count: true,
      }),
      prisma.opsTicket.groupBy({
        by: ["priority"],
        where: filteredWhere,
        _count: true,
      }),
      prisma.opsTicket.count({
        where: { ...filteredWhere, status: { in: [...ACTIVE_STATUSES] } },
      }),
      prisma.opsTicket.count({
        where: {
          ...filteredWhere,
          status: { in: [...ACTIVE_STATUSES] },
          slaBreached: true,
        },
      }),
      prisma.opsTicket.count({ where: tenantWhere }),
      prisma.opsTicket.count({
        where: { ...tenantWhere, ...originWhere("internal") },
      }),
      prisma.opsTicket.count({
        where: { ...tenantWhere, ...originWhere("guard") },
      }),
      prisma.opsTicket.count({
        where: { ...tenantWhere, ...originWhere("client") },
      }),
    ]);

    const byStatus: Record<string, number> = {
      open: 0,
      in_progress: 0,
      waiting: 0,
      pending_approval: 0,
      resolved: 0,
      closed: 0,
      cancelled: 0,
    };
    for (const row of statusGroup) byStatus[row.status] = row._count;

    const byPriority: Record<"p1" | "p2" | "p3" | "p4", number> = {
      p1: 0,
      p2: 0,
      p3: 0,
      p4: 0,
    };
    for (const row of priorityGroup) {
      const p = row.priority.toLowerCase();
      if (p === "p1" || p === "p2" || p === "p3" || p === "p4") {
        byPriority[p] = row._count;
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        total,
        active,
        slaBreached,
        byStatus,
        byPriority,
        byOrigin: {
          all: originAll,
          internal: originInternal,
          guard: originGuard,
          client: originClient,
        },
      },
    });
  } catch (error) {
    console.error("[OPS] Error counting tickets:", error);
    return NextResponse.json(
      { success: false, error: "No se pudieron obtener los conteos" },
      { status: 500 },
    );
  }
}
