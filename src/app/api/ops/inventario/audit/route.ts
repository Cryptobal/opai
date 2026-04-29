import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { ensureInventarioAccess } from "@/lib/inventory";
import { requireTenantModule } from "@/lib/require-module";

const INVENTORY_ENTITY_PREFIX = "inventario.";

/**
 * GET /api/ops/inventario/audit
 *
 * Lista de eventos de auditoría del módulo de inventario.
 * Filtros opcionales:
 *   - entity: prefijo dentro de inventario.* (warehouse, product, purchase, movement…)
 *   - entityId: id puntual
 *   - action: acción específica (created/updated/deleted/…)
 *   - userId: id del autor
 *   - from / to: rango de fechas (ISO yyyy-mm-dd)
 *   - page / limit: paginación
 *
 * Visible para cualquier rol con `canView(ops.inventario)`.
 */
export async function GET(request: NextRequest) {
  try {
    const modCheck = await requireTenantModule("ops_inventario");
    if (!modCheck.authorized) return modCheck.response;

    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await ensureInventarioAccess(ctx);
    if (forbidden) return forbidden;

    const { searchParams } = new URL(request.url);
    const entityFilter = searchParams.get("entity");
    const entityId = searchParams.get("entityId");
    const action = searchParams.get("action");
    const userId = searchParams.get("userId");
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    const page = Math.max(1, Number.parseInt(searchParams.get("page") || "1", 10));
    const limit = Math.min(100, Math.max(1, Number.parseInt(searchParams.get("limit") || "30", 10)));

    const entityPrefix = entityFilter
      ? entityFilter.startsWith(INVENTORY_ENTITY_PREFIX)
        ? entityFilter
        : `${INVENTORY_ENTITY_PREFIX}${entityFilter}`
      : INVENTORY_ENTITY_PREFIX;

    const where: Record<string, unknown> = {
      tenantId: ctx.tenantId,
      entity: { startsWith: entityPrefix },
    };
    if (entityId) where.entityId = entityId;
    if (action) where.action = action;
    if (userId) where.userId = userId;
    if (from || to) {
      where.createdAt = {};
      if (from) (where.createdAt as Record<string, unknown>).gte = new Date(from);
      if (to) {
        const toDate = new Date(to);
        toDate.setHours(23, 59, 59, 999);
        (where.createdAt as Record<string, unknown>).lte = toDate;
      }
    }

    const [items, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.auditLog.count({ where }),
    ]);

    // Resolver nombres de usuarios en una sola query.
    const userIds = Array.from(new Set(items.map((i) => i.userId).filter(Boolean))) as string[];
    const users = userIds.length
      ? await prisma.admin.findMany({
          where: { id: { in: userIds } },
          select: { id: true, name: true, email: true },
        })
      : [];
    const userMap = new Map(users.map((u) => [u.id, u]));

    const data = items.map((item) => ({
      id: item.id,
      action: item.action,
      entity: item.entity,
      entityId: item.entityId,
      details: item.details,
      createdAt: item.createdAt,
      ipAddress: item.ipAddress,
      user: item.userId
        ? {
            id: item.userId,
            name: userMap.get(item.userId)?.name ?? null,
            email: userMap.get(item.userId)?.email ?? item.userEmail ?? null,
          }
        : item.userEmail
          ? { id: null, name: null, email: item.userEmail }
          : null,
    }));

    return NextResponse.json({
      success: true,
      data,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    });
  } catch (e) {
    console.error("[inventario/audit GET]", e);
    return NextResponse.json(
      { success: false, error: "Error al cargar la auditoría" },
      { status: 500 }
    );
  }
}
