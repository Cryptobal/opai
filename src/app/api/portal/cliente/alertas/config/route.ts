/**
 * API Route: /api/portal/cliente/alertas/config
 * GET  — Return alert configs for the logged-in contact.
 *         If no config exists for a type, return a default (inactive) entry.
 * PUT  — Upsert alert configs for the contact.
 *         Body: Array<{ alertType: string; channels: { push: boolean; email: boolean }; isActive: boolean }>
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePortalClienteAuth } from "@/lib/portal-cliente";

/**
 * Tipos de notificación/alerta que el CLIENTE puede configurar desde su portal.
 *
 * Decisión de producto (PR2): removimos tipos operativos internos
 * (`guard_absent`, `checkpoint_missed`, `incident`) porque son alertas
 * que el cliente no debe ver — son para el equipo de supervisión.
 *
 * El cliente recibe notificaciones cuando:
 *   - Una ronda no se realizó o quedó incompleta.
 *   - Se sube un documento a su portal.
 *   - El soporte respondió un ticket.
 *   - Hay una cotización o contrato que requiere acción.
 *
 * Importante: estos tipos deben coincidir con `CLIENT_NOTIFICATION_TYPES`
 * del endpoint `/notificaciones` (extendido con los de acción/preferencia).
 */
export const CLIENT_ALERT_TYPES = [
  "ronda_no_realizada",
  "ronda_incompleta",
  "new_document",
  "ticket_replied",
  "quote_pending",
  "contract_expiring",
] as const;

/**
 * Tipos que previamente existían y que ya no deben ser configurables por el
 * cliente. Si una request los envía en el PUT, simplemente se ignoran. Si la
 * DB todavía tiene registros, el GET los filtra.
 */
export const LEGACY_OPERATIONAL_ALERT_TYPES = [
  "guard_absent",
  "checkpoint_missed",
  "incident",
  "ronda_incomplete", // typo legacy en inglés, reemplazado por `ronda_incompleta`.
] as const;

interface AlertConfigInput {
  alertType: string;
  channels: { push: boolean; email: boolean };
  isActive: boolean;
}

export async function GET(request: NextRequest) {
  try {
    const session = await requirePortalClienteAuth(request);
    if (!session) {
      return NextResponse.json(
        { success: false, error: "No autorizado" },
        { status: 401 }
      );
    }

    const existing = await prisma.portalClienteAlertConfig.findMany({
      where: {
        tenantId: session.tenantId,
        contactId: session.contactId,
        // Defensa en profundidad: aunque `CLIENT_ALERT_TYPES` filtra en memoria,
        // preferimos no traer registros legacy de la DB.
        alertType: { in: CLIENT_ALERT_TYPES as readonly string[] as string[] },
      },
    });

    const existingMap = new Map(existing.map((e) => [e.alertType, e]));

    const data = CLIENT_ALERT_TYPES.map((alertType) => {
      const record = existingMap.get(alertType);
      if (record) {
        return {
          id: record.id,
          alertType: record.alertType,
          channels: record.channels as { push: boolean; email: boolean },
          isActive: record.isActive,
        };
      }
      return {
        id: null,
        alertType,
        channels: { push: false, email: false },
        isActive: false,
      };
    });

    return NextResponse.json({ success: true, data });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Error interno";
    console.error("[Portal Cliente] Error fetching alert configs:", err);
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const session = await requirePortalClienteAuth(request);
    if (!session) {
      return NextResponse.json(
        { success: false, error: "No autorizado" },
        { status: 401 }
      );
    }

    const body: AlertConfigInput[] = await request.json();

    if (!Array.isArray(body)) {
      return NextResponse.json(
        { success: false, error: "Body debe ser un array" },
        { status: 400 }
      );
    }

    const validTypes = new Set<string>(CLIENT_ALERT_TYPES);

    const results = await Promise.all(
      body
        .filter((item) => validTypes.has(item.alertType))
        .map(async (item) => {
          const existing = await prisma.portalClienteAlertConfig.findFirst({
            where: {
              tenantId: session.tenantId,
              contactId: session.contactId,
              alertType: item.alertType,
            },
          });

          if (existing) {
            return prisma.portalClienteAlertConfig.update({
              where: { id: existing.id },
              data: {
                channels: item.channels,
                isActive: item.isActive,
              },
            });
          }

          return prisma.portalClienteAlertConfig.create({
            data: {
              tenantId: session.tenantId,
              contactId: session.contactId,
              accountId: session.accountId,
              alertType: item.alertType,
              channels: item.channels,
              isActive: item.isActive,
            },
          });
        })
    );

    const data = results.map((r) => ({
      id: r.id,
      alertType: r.alertType,
      channels: r.channels as { push: boolean; email: boolean },
      isActive: r.isActive,
    }));

    return NextResponse.json({ success: true, data });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Error interno";
    console.error("[Portal Cliente] Error updating alert configs:", err);
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
