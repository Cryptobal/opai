import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { ensureInventarioAccess } from "@/lib/inventory";
import { requireTenantModule } from '@/lib/require-module';
import { sendNotification } from "@/lib/notification-service";
import { sendPushToPortalUser } from "@/lib/pwa/push-service";
import { z } from "zod";

const createDeliverySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  fromWarehouseId: z.string().uuid(),
  guardiaId: z.string().uuid(),
  installationId: z.string().uuid(),
  notes: z.string().optional(),
  lines: z
    .array(
      z.object({
        variantId: z.string().uuid(),
        quantity: z.number().int().positive(),
      })
    )
    .min(1),
});

export async function GET(request: NextRequest) {
  try {
    const modCheck = await requireTenantModule('ops_inventario');
    if (!modCheck.authorized) return modCheck.response;

    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await ensureInventarioAccess(ctx);
    if (forbidden) return forbidden;

    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type");
    const guardiaId = searchParams.get("guardiaId");
    const installationId = searchParams.get("installationId");
    const from = searchParams.get("from");
    const to = searchParams.get("to");

    const where: Record<string, unknown> = { tenantId: ctx.tenantId };
    if (type) where.type = type;
    if (guardiaId) where.guardiaId = guardiaId;
    if (installationId) where.installationId = installationId;
    if (from || to) {
      where.date = {};
      if (from) (where.date as Record<string, unknown>).gte = new Date(from);
      if (to) (where.date as Record<string, unknown>).lte = new Date(to);
    }

    const movements = await prisma.inventoryMovement.findMany({
      where,
      include: {
        fromWarehouse: { select: { id: true, name: true } },
        toWarehouse: { select: { id: true, name: true } },
        guardia: {
          select: {
            id: true,
            persona: { select: { firstName: true, lastName: true } },
          },
        },
        installation: { select: { id: true, name: true } },
        lines: {
          include: {
            variant: {
              include: { product: true, size: true },
            },
          },
        },
      },
      orderBy: { date: "desc" },
      take: 100,
    });

    return NextResponse.json(movements);
  } catch (e) {
    console.error("[inventario/movements GET]", e);
    return NextResponse.json(
      { success: false, error: "Error al listar movimientos" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const modCheck = await requireTenantModule('ops_inventario');
    if (!modCheck.authorized) return modCheck.response;

    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await ensureInventarioAccess(ctx);
    if (forbidden) return forbidden;

    const body = await request.json();
    const parsed = createDeliverySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const movement = await prisma.$transaction(async (tx) => {
      const mov = await tx.inventoryMovement.create({
        data: {
          tenantId: ctx.tenantId,
          type: "delivery",
          date: new Date(parsed.data.date),
          fromWarehouseId: parsed.data.fromWarehouseId,
          guardiaId: parsed.data.guardiaId,
          installationId: parsed.data.installationId,
          notes: parsed.data.notes ?? null,
          createdBy: ctx.userId,
        },
      });

      for (const line of parsed.data.lines) {
        const stock = await tx.inventoryStock.findFirst({
          where: {
            warehouseId: parsed.data.fromWarehouseId,
            variantId: line.variantId,
            tenantId: ctx.tenantId,
          },
        });

        if (!stock || stock.quantity < line.quantity) {
          throw new Error(
            `Stock insuficiente para variante ${line.variantId} (necesitas ${line.quantity})`
          );
        }

        const unitCost = stock.avgCost ?? 0;

        await tx.inventoryMovementLine.create({
          data: {
            movementId: mov.id,
            variantId: line.variantId,
            quantity: line.quantity,
            unitCost,
          },
        });

        await tx.inventoryGuardiaAssignment.create({
          data: {
            tenantId: ctx.tenantId,
            guardiaId: parsed.data.guardiaId,
            movementId: mov.id,
            variantId: line.variantId,
            quantity: line.quantity,
            installationId: parsed.data.installationId ?? null,
            deliveredAt: new Date(parsed.data.date),
          },
        });

        await tx.inventoryStock.update({
          where: { id: stock.id },
          data: { quantity: stock.quantity - line.quantity },
        });
      }

      return tx.inventoryMovement.findUnique({
        where: { id: mov.id },
        include: {
          fromWarehouse: { select: { id: true, name: true } },
          guardia: {
            select: {
              id: true,
              persona: { select: { firstName: true, lastName: true } },
            },
          },
          installation: { select: { id: true, name: true } },
          lines: {
            include: {
              variant: {
                include: { product: true, size: true },
              },
            },
          },
        },
      });
    });

    // ── Notifications (fire-and-forget after transaction success) ──
    if (movement) {
      const guardiaName = movement.guardia
        ? `${movement.guardia.persona.firstName} ${movement.guardia.persona.lastName}`.trim()
        : "Guardia";
      const itemsSummary = movement.lines
        .map((l) => `${l.quantity}x ${l.variant.product.name}${l.variant.size ? ` ${l.variant.size.sizeCode}` : ""}`)
        .join(", ");
      const installationName = movement.installation?.name || "";

      // Bell notification for admins
      sendNotification({
        tenantId: ctx.tenantId,
        type: "inventory_delivery",
        title: `Entrega a ${guardiaName}`,
        message: `${itemsSummary}${installationName ? ` en ${installationName}` : ""}`,
        link: "/ops/inventario/entregas",
      }).catch((err) => console.error("[inventory_delivery bell]", err));

      // Push notification to guard's portal
      sendPushToPortalUser({
        tenantId: ctx.tenantId,
        notifKey: "inventory_delivery",
        userType: "guardia",
        userId: parsed.data.guardiaId,
        portalType: "guardia",
        title: "Entrega de equipamiento",
        body: `Se te ha entregado: ${itemsSummary}${installationName ? ` en ${installationName}` : ""}. Confirma la recepción en tu portal.`,
        url: "/portal/guardia?section=equipamiento",
        tag: `inv-delivery-${movement.id}`,
      }).catch((err) => console.error("[inventory_delivery push]", err));

      // ── Low stock alerts (check after delivery) ──
      const updatedStocks = await prisma.inventoryStock.findMany({
        where: {
          tenantId: ctx.tenantId,
          warehouseId: parsed.data.fromWarehouseId,
          variantId: { in: parsed.data.lines.map((l) => l.variantId) },
        },
        include: {
          variant: { include: { product: { select: { name: true } }, size: { select: { sizeCode: true } } } },
          warehouse: { select: { name: true } },
        },
      });

      const lowStockItems = updatedStocks.filter(
        (s) => s.variant.minStock > 0 && s.quantity <= s.variant.minStock
      );
      const outOfStockItems = updatedStocks.filter((s) => s.quantity === 0);

      if (outOfStockItems.length > 0) {
        const outNames = outOfStockItems
          .map((s) => `${s.variant.product.name}${s.variant.size ? ` ${s.variant.size.sizeCode}` : ""}`)
          .join(", ");
        sendNotification({
          tenantId: ctx.tenantId,
          type: "inventory_delivery",
          title: "Stock agotado",
          message: `${outNames} en ${outOfStockItems[0].warehouse.name} llegó a 0 unidades.`,
          link: "/ops/inventario/stock",
        }).catch((err) => console.error("[stock_alert bell]", err));
      } else if (lowStockItems.length > 0) {
        const lowNames = lowStockItems
          .map((s) => `${s.variant.product.name}${s.variant.size ? ` ${s.variant.size.sizeCode}` : ""} (${s.quantity}/${s.variant.minStock})`)
          .join(", ");
        sendNotification({
          tenantId: ctx.tenantId,
          type: "inventory_delivery",
          title: "Stock bajo mínimo",
          message: `${lowNames} en ${lowStockItems[0].warehouse.name}`,
          link: "/ops/inventario/stock",
        }).catch((err) => console.error("[stock_alert bell]", err));
      }
    }

    return NextResponse.json(movement);
  } catch (e) {
    console.error("[inventario/movements POST]", e);
    const msg = e instanceof Error ? e.message : "Error al registrar entrega";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
