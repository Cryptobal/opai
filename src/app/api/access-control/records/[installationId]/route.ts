import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { safeAccessControlQuery } from "@/lib/access-control/safe-query";
import { requireAccessControlAuth } from "@/lib/access-control/auth";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ installationId: string }> }
) {
  try {
    const { installationId } = await params;

    const authCtx = await requireAccessControlAuth(request, installationId);
    if (!authCtx) {
      return NextResponse.json({ success: false, error: "No autorizado" }, { status: 401 });
    }
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status"); // "in_site" | "all"
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    const type = searchParams.get("type");
    const search = searchParams.get("search");
    const listMatch = searchParams.get("listMatch"); // "whitelist" | "blacklist" | "none"
    const qrSource = searchParams.get("qrSource");
    const guardId = searchParams.get("guardId");
    const page = parseInt(searchParams.get("page") || "1", 10);
    const limit = Math.min(parseInt(searchParams.get("limit") || "50", 10), 200);
    const offset = (page - 1) * limit;

    const where: Prisma.AccessControlRecordWhereInput = {
      installationId,
    };

    if (status === "in_site") {
      where.exitAt = null;
    }

    const entryAt: Prisma.DateTimeFilter = {};
    if (from) entryAt.gte = new Date(from);
    if (to) entryAt.lte = new Date(to);
    if (Object.keys(entryAt).length > 0) {
      where.entryAt = entryAt;
    }

    if (type) {
      where.recordType = type;
    }

    if (search) {
      where.OR = [
        { fullName: { contains: search, mode: "insensitive" } },
        { rut: { contains: search } },
        { company: { contains: search, mode: "insensitive" } },
        { vehiclePlate: { contains: search, mode: "insensitive" } },
      ];
    }

    if (listMatch === "none") {
      where.listMatch = null;
    } else if (listMatch === "whitelist" || listMatch === "blacklist") {
      where.listMatch = listMatch;
    }
    if (qrSource) {
      where.qrSource = qrSource;
    }
    if (guardId) {
      where.entryGuardId = guardId;
    }

    const result = await safeAccessControlQuery(
      () => Promise.all([
        prisma.accessControlRecord.findMany({
          where,
          orderBy: { entryAt: "desc" },
          take: limit,
          skip: offset,
        }),
        prisma.accessControlRecord.count({ where }),
      ]),
      [[], 0] as [unknown[], number],
    );

    const [records, total] = result;

    return NextResponse.json({
      success: true,
      data: records,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    console.error("[AccessControl] Error fetching records:", error);
    return NextResponse.json(
      { success: false, error: "Error al obtener registros" },
      { status: 500 }
    );
  }
}
