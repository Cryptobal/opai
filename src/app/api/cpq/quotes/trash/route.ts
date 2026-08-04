/**
 * API Route: /api/cpq/quotes/trash
 * GET - Papelera de cotizaciones (paginada, con búsqueda), ordenada por deletedAt desc.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { requireQuoteDelete } from "@/lib/api-auth-cpq";
import { requireTenantModule } from "@/lib/require-module";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";

const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;

export async function GET(request: NextRequest) {
  try {
    const modCheck = await requireTenantModule("cpq");
    if (!modCheck.authorized) return modCheck.response;

    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await requireQuoteDelete(ctx);
    if (forbidden) return forbidden;
    const tenantId = ctx.tenantId;

    const sp = request.nextUrl.searchParams;
    const search = sp.get("search")?.trim() || undefined;
    const page = Math.max(1, Number.parseInt(sp.get("page") ?? "1", 10) || 1);
    const pageSizeRaw = Number.parseInt(
      sp.get("pageSize") ?? sp.get("limit") ?? String(DEFAULT_PAGE_SIZE),
      10,
    );
    const pageSize = Math.min(
      MAX_PAGE_SIZE,
      Math.max(1, Number.isFinite(pageSizeRaw) ? pageSizeRaw : DEFAULT_PAGE_SIZE),
    );
    // Por defecto solo la papelera vigente (no restaurada, no expirada).
    const includeRestored = sp.get("includeRestored") === "true";

    const where: Prisma.CpqQuoteTrashWhereInput = {
      tenantId,
      ...(includeRestored ? {} : { restoredAt: null, expiresAt: { gt: new Date() } }),
      ...(search
        ? {
            OR: [
              { code: { contains: search, mode: "insensitive" } },
              { name: { contains: search, mode: "insensitive" } },
              { installationName: { contains: search, mode: "insensitive" } },
            ],
          }
        : {}),
    };

    const [rows, total] = await Promise.all([
      prisma.cpqQuoteTrash.findMany({
        where,
        orderBy: { deletedAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          quoteId: true,
          code: true,
          name: true,
          status: true,
          accountId: true,
          dealId: true,
          bundleId: true,
          installationName: true,
          salePriceMonthly: true,
          reason: true,
          deletedBy: true,
          deletedAt: true,
          expiresAt: true,
          restoredAt: true,
        },
      }),
      prisma.cpqQuoteTrash.count({ where }),
    ]);

    return NextResponse.json({
      success: true,
      data: rows,
      meta: {
        page,
        pageSize,
        total,
        hasMore: page * pageSize < total,
      },
    });
  } catch (error) {
    console.error("[cpq/quotes/trash GET]", error);
    return NextResponse.json(
      { success: false, error: "Error al listar la papelera" },
      { status: 500 },
    );
  }
}
