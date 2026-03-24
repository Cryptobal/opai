import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { ensureInventarioAccess } from "@/lib/inventory";
import { sendNotification } from "@/lib/notification-service";
import { sendPushToPortalUser } from "@/lib/pwa/push-service";
import { z } from "zod";
import bcrypt from "bcryptjs";

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

      // Generate confirmation PIN (6 digits, expires in 24h)
      const pin = String(Math.floor(100000 + Math.random() * 900000));
      const pinHash = await bcrypt.hash(pin, 10);
      const pinExp = new Date(Date.now() + 24 * 60 * 60 * 1000);

      await prisma.inventoryMovement.update({
        where: { id: movement.id },
        data: {
          confirmationPin: pinHash,
          confirmationPinExp: pinExp,
          confirmationStatus: "pending",
        },
      });

      // Send PIN via email to guard (fire-and-forget)
      const guardia = await prisma.opsGuardia.findUnique({
        where: { id: parsed.data.guardiaId },
        select: { persona: { select: { email: true } } },
      });

      if (guardia?.persona.email) {
        import("@/lib/resend").then(async ({ resend, getTenantEmailConfig }) => {
          try {
            const emailConfig = await getTenantEmailConfig(ctx.tenantId);
            await resend.emails.send({
              from: emailConfig.from,
              to: guardia.persona.email!,
              subject: `Confirma tu entrega de equipamiento — PIN: ${pin}`,
              html: `
                <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:20px">
                  <h2 style="color:#333">Entrega de Equipamiento</h2>
                  <p>Se ha registrado una entrega a tu nombre:</p>
                  <ul style="color:#555">${movement.lines.map((l) =>
                    `<li>${l.quantity}x ${l.variant.product.name}${l.variant.size ? ` ${l.variant.size.sizeCode}` : ""}</li>`
                  ).join("")}</ul>
                  ${installationName ? `<p><strong>Instalación:</strong> ${installationName}</p>` : ""}
                  <p><strong>Fecha:</strong> ${new Date(parsed.data.date).toLocaleDateString("es-CL")}</p>
                  <div style="background:#f0fdf4;border:2px solid #22c55e;border-radius:12px;padding:20px;text-align:center;margin:20px 0">
                    <p style="margin:0 0 8px;color:#666;font-size:14px">Tu PIN de confirmación:</p>
                    <p style="margin:0;font-size:32px;font-weight:bold;letter-spacing:8px;color:#16a34a">${pin}</p>
                    <p style="margin:8px 0 0;color:#999;font-size:12px">Válido por 24 horas</p>
                  </div>
                  <p style="color:#666;font-size:13px">Ingresa este PIN en tu portal para confirmar la recepción del equipamiento.</p>
                </div>
              `,
            });
          } catch (emailErr) {
            console.error("[inventory_delivery email]", emailErr);
          }
        }).catch((err) => console.error("[inventory_delivery email import]", err));
      }
    }

    return NextResponse.json(movement);
  } catch (e) {
    console.error("[inventario/movements POST]", e);
    const msg = e instanceof Error ? e.message : "Error al registrar entrega";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
