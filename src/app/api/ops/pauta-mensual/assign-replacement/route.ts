import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parseBody, requireAuth, unauthorized } from "@/lib/api-auth";
import { z } from "zod";
import { createOpsAuditLog, ensureOpsAccess } from "@/lib/ops";
import { EVENT_SUBTYPES } from "@/lib/guard-events";

const assignReplacementSchema = z.object({
    puestoId: z.string().uuid(),
    slotNumber: z.number().int().positive(),
    replacementGuardiaId: z.string().uuid(),
    guardEventId: z.string().uuid(),
    replacementReason: z.string().optional(),
    startDate: z.string().datetime(),
    endDate: z.string().datetime(),
});

export async function POST(request: NextRequest) {
    try {
        const ctx = await requireAuth();
        if (!ctx) return unauthorized();
        const forbidden = await ensureOpsAccess(ctx);
        if (forbidden) return forbidden;

        const parsed = await parseBody(request, assignReplacementSchema);
        if (parsed.error) return parsed.error;
        const body = parsed.data;

        // 1. Verify Puesto and Installation
        const puesto = await prisma.opsPuestoOperativo.findFirst({
            where: { id: body.puestoId, tenantId: ctx.tenantId },
            select: { id: true, installationId: true, active: true },
        });
        if (!puesto) {
            return NextResponse.json(
                { success: false, error: "Puesto operativo no encontrado" },
                { status: 404 }
            );
        }
        if (!puesto.active) {
            return NextResponse.json(
                { success: false, error: "No se puede asignar reemplazo en un puesto desactivado" },
                { status: 400 }
            );
        }

        // 2. Verify Replacement Guardia
        const guardia = await prisma.opsGuardia.findFirst({
            where: { id: body.replacementGuardiaId, tenantId: ctx.tenantId },
            select: { id: true, isBlacklisted: true, status: true },
        });
        if (!guardia) {
            return NextResponse.json(
                { success: false, error: "Guardia de reemplazo no encontrado" },
                { status: 404 }
            );
        }
        if (guardia.isBlacklisted || guardia.status !== "active") {
            return NextResponse.json(
                { success: false, error: "No se puede asignar un guardia inactivo o en lista negra" },
                { status: 400 }
            );
        }

        // 3. Verify Guard Event
        const guardEvent = await prisma.opsGuardEvent.findFirst({
            where: { id: body.guardEventId, tenantId: ctx.tenantId },
            select: { id: true, category: true, status: true, subtype: true },
        });
        if (!guardEvent || guardEvent.category !== "ausencia" || guardEvent.status !== "approved") {
            return NextResponse.json(
                { success: false, error: "Evento de ausencia inválido o no aprobado" },
                { status: 400 }
            );
        }

        // Assign reason from the guardEvent subtype if not provided
        const reason = body.replacementReason || guardEvent.subtype;

        // Determine the absence shiftCode from the event subtype
        const subtypeDef = EVENT_SUBTYPES.ausencia.find((s) => s.value === guardEvent.subtype);
        const absenceShiftCode = subtypeDef?.shiftCode;

        // 4. Update entries in OpsPautaMensual within the date range
        const start = new Date(body.startDate);
        const end = new Date(body.endDate);

        // Update slots with the absence shiftCode (V/L/PCG/PSG) that were painted
        // when the absence was approved. Fallback to "T" for legacy data.
        const targetShiftCodes = absenceShiftCode ? [absenceShiftCode, "T"] : ["T"];
        const updatedCount = await prisma.opsPautaMensual.updateMany({
            where: {
                tenantId: ctx.tenantId,
                puestoId: body.puestoId,
                slotNumber: body.slotNumber,
                shiftCode: { in: targetShiftCodes },
                date: {
                    gte: start,
                    lte: end,
                },
            },
            data: {
                replacementGuardiaId: body.replacementGuardiaId,
                replacementReason: reason,
                guardEventId: body.guardEventId,
                // We do *not* touch plannedGuardiaId (the titular guard remains)
            },
        });

        // 5. Audit Log
        await createOpsAuditLog(ctx, "ops.pauta.assign_replacement", "ops_pauta", puesto.installationId, {
            puestoId: body.puestoId,
            slotNumber: body.slotNumber,
            replacementGuardiaId: body.replacementGuardiaId,
            guardEventId: body.guardEventId,
            startDate: start.toISOString(),
            endDate: end.toISOString(),
            updatedCells: updatedCount.count,
        });

        return NextResponse.json({
            success: true,
            message: `${updatedCount.count} celdas actualizadas con el reemplazo.`,
            updatedCells: updatedCount.count,
        });
    } catch (error) {
        const message = error instanceof Error ? error.message : "Error al asignar reemplazo";
        console.error("[OPS] Error assign-replacement:", error);
        return NextResponse.json(
            { success: false, error: message },
            { status: 500 }
        );
    }
}
