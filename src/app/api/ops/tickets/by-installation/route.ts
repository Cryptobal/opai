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
type SortBy = "criticality" | "total" | "p1" | "breached" | "name";
type SortDir = "asc" | "desc";

function parseOrigin(v: string | null): OriginFilter {
  if (v === "internal" || v === "guard" || v === "client") return v;
  return null;
}

function parseSortBy(v: string | null): SortBy {
  if (v === "total" || v === "p1" || v === "breached" || v === "name") return v;
  return "criticality";
}

function parseSortDir(v: string | null, sortBy: SortBy): SortDir {
  if (v === "asc" || v === "desc") return v;
  return sortBy === "name" ? "asc" : "desc";
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

function criticalityScore(row: {
  slaBreached: number;
  p1: number;
  p2: number;
  p3: number;
}): number {
  return row.slaBreached * 10 + row.p1 * 5 + row.p2 * 2 + row.p3 * 1;
}

export async function GET(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await ensureOpsAccess(ctx);
    if (forbidden) return forbidden;

    const sp = new URL(request.url).searchParams;
    const type = parseOrigin(sp.get("type"));
    const onlyWithActive = sp.get("onlyWithActive") !== "false"; // default true
    const sortBy = parseSortBy(sp.get("sortBy"));
    const sortDir = parseSortDir(sp.get("sortDir"), sortBy);

    const activeWhere: Prisma.OpsTicketWhereInput = {
      tenantId: ctx.tenantId,
      status: { in: [...ACTIVE_STATUSES] },
      installationId: { not: null },
      ...originWhere(type),
    };

    const tickets = await prisma.opsTicket.findMany({
      where: activeWhere,
      select: {
        installationId: true,
        priority: true,
        slaBreached: true,
        updatedAt: true,
      },
    });

    const byId = new Map<
      string,
      {
        total: number;
        p1: number;
        p2: number;
        p3: number;
        p4: number;
        slaBreached: number;
        lastActivityAt: Date;
      }
    >();

    for (const t of tickets) {
      const id = t.installationId!;
      let row = byId.get(id);
      if (!row) {
        row = {
          total: 0,
          p1: 0,
          p2: 0,
          p3: 0,
          p4: 0,
          slaBreached: 0,
          lastActivityAt: t.updatedAt,
        };
        byId.set(id, row);
      }
      row.total += 1;
      const p = t.priority.toLowerCase();
      if (p === "p1") row.p1 += 1;
      else if (p === "p2") row.p2 += 1;
      else if (p === "p3") row.p3 += 1;
      else if (p === "p4") row.p4 += 1;
      if (t.slaBreached) row.slaBreached += 1;
      if (t.updatedAt > row.lastActivityAt) row.lastActivityAt = t.updatedAt;
    }

    const installationIds = [...byId.keys()];
    const installations = await prisma.crmInstallation.findMany({
      where: { id: { in: installationIds }, tenantId: ctx.tenantId },
      select: {
        id: true,
        name: true,
        lat: true,
        lng: true,
        address: true,
        commune: true,
        account: { select: { name: true } },
      },
    });
    const instMap = new Map(installations.map((i) => [i.id, i]));

    let rows = installationIds.map((id) => {
      const row = byId.get(id)!;
      const inst = instMap.get(id);
      return {
        installationId: id,
        installationName: inst?.name ?? "(Instalación desconocida)",
        clientName: inst?.account?.name ?? null,
        lat: inst?.lat ?? null,
        lng: inst?.lng ?? null,
        address: inst?.address ?? null,
        commune: inst?.commune ?? null,
        totalActive: row.total,
        byPriority: { p1: row.p1, p2: row.p2, p3: row.p3, p4: row.p4 },
        slaBreached: row.slaBreached,
        lastActivityAt: row.lastActivityAt.toISOString(),
        criticalityScore: criticalityScore({
          slaBreached: row.slaBreached,
          p1: row.p1,
          p2: row.p2,
          p3: row.p3,
        }),
      };
    });

    // If onlyWithActive=false, include installations with zero tickets
    if (!onlyWithActive) {
      const allActive = await prisma.crmInstallation.findMany({
        where: { tenantId: ctx.tenantId, isActive: true },
        select: {
          id: true,
          name: true,
          lat: true,
          lng: true,
          address: true,
          commune: true,
          account: { select: { name: true } },
        },
      });
      const already = new Set(rows.map((r) => r.installationId));
      for (const inst of allActive) {
        if (already.has(inst.id)) continue;
        rows.push({
          installationId: inst.id,
          installationName: inst.name,
          clientName: inst.account?.name ?? null,
          lat: inst.lat ?? null,
          lng: inst.lng ?? null,
          address: inst.address ?? null,
          commune: inst.commune ?? null,
          totalActive: 0,
          byPriority: { p1: 0, p2: 0, p3: 0, p4: 0 },
          slaBreached: 0,
          lastActivityAt: new Date(0).toISOString(),
          criticalityScore: 0,
        });
      }
    }

    rows.sort((a, b) => {
      const mul = sortDir === "asc" ? 1 : -1;
      if (sortBy === "name") {
        return mul * a.installationName.localeCompare(b.installationName, "es");
      }
      if (sortBy === "total") return mul * (a.totalActive - b.totalActive);
      if (sortBy === "p1") return mul * (a.byPriority.p1 - b.byPriority.p1);
      if (sortBy === "breached") return mul * (a.slaBreached - b.slaBreached);
      return mul * (a.criticalityScore - b.criticalityScore);
    });

    return NextResponse.json({
      success: true,
      data: { installations: rows },
    });
  } catch (error) {
    console.error("[OPS] Error aggregating tickets by installation:", error);
    return NextResponse.json(
      { success: false, error: "No se pudo obtener agregación por instalación" },
      { status: 500 },
    );
  }
}
