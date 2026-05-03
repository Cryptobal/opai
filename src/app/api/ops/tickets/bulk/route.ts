/**
 * API Route: /api/ops/tickets/bulk
 * POST — Operaciones masivas sobre múltiples tickets.
 *
 * Body:
 * {
 *   ticketIds: string[],          // 1..100 ids (UUIDs).
 *   action:
 *     | "assign"                  // payload: { assignedTo: string | null }
 *     | "status"                  // payload: { status: "open"|"in_progress"|"waiting"|"resolved"|"cancelled"|"rejected" }
 *     | "priority"                // payload: { priority: "p1"|"p2"|"p3"|"p4" }
 *     | "addTag"                  // payload: { tag: string }
 *     | "removeTag",              // payload: { tag: string }
 *   payload: {...}
 * }
 *
 * Reglas:
 *  - Multi-tenant: solo se afectan tickets del tenant del caller.
 *  - assign: si assignedTo es un id, debe existir como Admin del mismo
 *    tenant y estar `active`. Pasar null lo deja sin asignar.
 *  - status: usa los valores válidos del enum. La transición individual
 *    NO se valida con canTransitionTo en bulk (sería ruido en operación
 *    masiva); el caller asume responsabilidad o el frontend filtra.
 *  - addTag/removeTag: ignora ids cuyo array de tags ya tiene/no tiene
 *    el tag. Trim + max 32 chars.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { ensureOpsAccess } from "@/lib/ops";

export const dynamic = "force-dynamic";

const MAX_IDS = 100;

const VALID_BULK_STATUSES = [
  "open",
  "in_progress",
  "waiting",
  "resolved",
  "cancelled",
  "rejected",
] as const;
const VALID_BULK_PRIORITIES = ["p1", "p2", "p3", "p4"] as const;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

interface BulkBody {
  ticketIds?: unknown;
  action?: unknown;
  payload?: unknown;
}

function parseTicketIds(raw: unknown): string[] | null {
  if (!Array.isArray(raw)) return null;
  const cleaned = Array.from(
    new Set(
      raw
        .filter((x): x is string => typeof x === "string")
        .map((x) => x.trim())
        .filter(Boolean)
        .filter((x) => UUID_RE.test(x)),
    ),
  );
  if (cleaned.length === 0) return null;
  if (cleaned.length > MAX_IDS) return null;
  return cleaned;
}

export async function POST(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await ensureOpsAccess(ctx);
    if (forbidden) return forbidden;

    const body = (await request.json()) as BulkBody;
    const ticketIds = parseTicketIds(body.ticketIds);
    if (!ticketIds) {
      return NextResponse.json(
        {
          success: false,
          error: `ticketIds debe ser un array de 1 a ${MAX_IDS} UUIDs válidos`,
        },
        { status: 400 },
      );
    }
    const action = typeof body.action === "string" ? body.action : null;
    const payload = (body.payload ?? {}) as Record<string, unknown>;

    // Verifica que todos los ids pertenezcan al tenant del caller.
    const owned = await prisma.opsTicket.findMany({
      where: { id: { in: ticketIds }, tenantId: ctx.tenantId },
      select: { id: true, tags: true },
    });
    const ownedIds = new Set(owned.map((t) => t.id));
    const notFound = ticketIds.filter((id) => !ownedIds.has(id));
    if (ownedIds.size === 0) {
      return NextResponse.json(
        { success: false, error: "Ningún ticket pertenece al tenant" },
        { status: 404 },
      );
    }

    let updated = 0;

    switch (action) {
      case "assign": {
        const rawAssignee = payload.assignedTo;
        const assignedTo =
          rawAssignee === null
            ? null
            : typeof rawAssignee === "string" && rawAssignee.trim()
              ? rawAssignee.trim()
              : undefined;
        if (assignedTo === undefined) {
          return NextResponse.json(
            {
              success: false,
              error: "payload.assignedTo debe ser string o null",
            },
            { status: 400 },
          );
        }
        if (assignedTo) {
          const admin = await prisma.admin.findFirst({
            where: {
              id: assignedTo,
              tenantId: ctx.tenantId,
              status: "active",
            },
            select: { id: true },
          });
          if (!admin) {
            return NextResponse.json(
              {
                success: false,
                error: "El admin asignado no existe o no está activo en el tenant",
              },
              { status: 400 },
            );
          }
        }
        const res = await prisma.opsTicket.updateMany({
          where: { id: { in: Array.from(ownedIds) }, tenantId: ctx.tenantId },
          data: { assignedTo },
        });
        updated = res.count;
        break;
      }
      case "status": {
        const status = payload.status;
        if (
          typeof status !== "string" ||
          !(VALID_BULK_STATUSES as readonly string[]).includes(status)
        ) {
          return NextResponse.json(
            {
              success: false,
              error: `payload.status inválido. Válidos: ${VALID_BULK_STATUSES.join(", ")}`,
            },
            { status: 400 },
          );
        }
        const data: Record<string, unknown> = { status };
        const now = new Date();
        if (status === "resolved") data.resolvedAt = now;
        if (status === "cancelled" || status === "rejected") data.closedAt = now;
        const res = await prisma.opsTicket.updateMany({
          where: { id: { in: Array.from(ownedIds) }, tenantId: ctx.tenantId },
          data,
        });
        updated = res.count;
        break;
      }
      case "priority": {
        const priority = payload.priority;
        if (
          typeof priority !== "string" ||
          !(VALID_BULK_PRIORITIES as readonly string[]).includes(priority)
        ) {
          return NextResponse.json(
            {
              success: false,
              error: `payload.priority inválido. Válidos: ${VALID_BULK_PRIORITIES.join(", ")}`,
            },
            { status: 400 },
          );
        }
        const res = await prisma.opsTicket.updateMany({
          where: { id: { in: Array.from(ownedIds) }, tenantId: ctx.tenantId },
          data: { priority },
        });
        updated = res.count;
        break;
      }
      case "addTag":
      case "removeTag": {
        const rawTag = payload.tag;
        const tag =
          typeof rawTag === "string" ? rawTag.trim().slice(0, 32) : "";
        if (!tag) {
          return NextResponse.json(
            { success: false, error: "payload.tag requerido (1-32 chars)" },
            { status: 400 },
          );
        }
        // updateMany no soporta operaciones de array sobre String[]; iteramos.
        // Tickets ya cargados arriba con sus tags actuales.
        const ops = owned.map((t) => {
          const current = (t.tags ?? []) as string[];
          let next: string[];
          if (action === "addTag") {
            if (current.includes(tag)) return null; // sin cambios
            next = [...current, tag];
          } else {
            if (!current.includes(tag)) return null;
            next = current.filter((x) => x !== tag);
          }
          return prisma.opsTicket.update({
            where: { id: t.id },
            data: { tags: next },
            select: { id: true },
          });
        }).filter(Boolean) as Array<Promise<{ id: string }>>;
        const results = await Promise.allSettled(ops);
        updated = results.filter((r) => r.status === "fulfilled").length;
        break;
      }
      default:
        return NextResponse.json(
          {
            success: false,
            error:
              "action inválida. Válidas: assign, status, priority, addTag, removeTag",
          },
          { status: 400 },
        );
    }

    return NextResponse.json({
      success: true,
      data: {
        action,
        updated,
        skipped: ticketIds.length - updated,
        notFoundIds: notFound,
      },
    });
  } catch (error) {
    console.error("[OPS] Error bulk tickets:", error);
    return NextResponse.json(
      { success: false, error: "Error al ejecutar la acción masiva" },
      { status: 500 },
    );
  }
}
