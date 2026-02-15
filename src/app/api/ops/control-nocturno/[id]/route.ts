import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized, resolveApiPerms } from "@/lib/api-auth";
import { hasCapability } from "@/lib/permissions";
import { ensureOpsAccess, createOpsAuditLog } from "@/lib/ops";
import { sendControlNocturnoEmail } from "@/lib/control-nocturno-email";
import { generateControlNocturnoSummary } from "@/lib/control-nocturno-ai";

type RouteParams = { params: Promise<{ id: string }> };

/* ── GET — obtener reporte con todo el detalle ── */

export async function GET(_request: NextRequest, { params }: RouteParams) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await ensureOpsAccess(ctx);
    if (forbidden) return forbidden;

    const { id } = await params;

    const reporte = await prisma.opsControlNocturno.findFirst({
      where: { id, tenantId: ctx.tenantId },
      include: {
        instalaciones: {
          include: {
            guardias: {
              orderBy: { createdAt: "asc" },
            },
            rondas: {
              orderBy: { rondaNumber: "asc" },
            },
          },
          orderBy: { orderIndex: "asc" },
        },
      },
    });

    if (!reporte) {
      return NextResponse.json(
        { success: false, error: "Reporte no encontrado" },
        { status: 404 },
      );
    }

    return NextResponse.json({ success: true, data: reporte });
  } catch (error) {
    console.error("[OPS] Error getting control nocturno:", error);
    return NextResponse.json(
      { success: false, error: "No se pudo obtener el reporte" },
      { status: 500 },
    );
  }
}

/* ── PATCH — actualizar reporte (guardar borrador) ── */

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await ensureOpsAccess(ctx);
    if (forbidden) return forbidden;

    const { id } = await params;
    const body = await request.json();

    const reporte = await prisma.opsControlNocturno.findFirst({
      where: { id, tenantId: ctx.tenantId },
    });
    if (!reporte) {
      return NextResponse.json({ success: false, error: "Reporte no encontrado" }, { status: 404 });
    }
    // Allow "resend" on finalized reports, block other edits
    const isFinal = reporte.status === "aprobado" || reporte.status === "enviado";
    if (isFinal && body.action !== "resend") {
      return NextResponse.json({ success: false, error: "El reporte ya fue enviado" }, { status: 400 });
    }

    const {
      action, // "save" | "submit" | "resend"
      generalNotes,
      centralOperatorName,
      centralLabel,
      instalaciones,
    } = body as {
      action?: string;
      generalNotes?: string;
      centralOperatorName?: string;
      centralLabel?: string;
      instalaciones?: Array<{
        id: string;
        guardiasRequeridos?: number;
        guardiasPresentes?: number;
        horaLlegadaTurnoDia?: string;
        guardiaDiaNombres?: string;
        statusInstalacion?: string;
        notes?: string;
        guardias?: Array<{
          id?: string;
          guardiaId?: string;
          guardiaNombre: string;
          isExtra?: boolean;
          horaLlegada?: string;
        }>;
        rondas?: Array<{
          id: string;
          horaMarcada?: string;
          status?: string;
          notes?: string;
        }>;
      }>;
    };

    // Update base fields
    const updateData: Record<string, unknown> = {};
    if (generalNotes !== undefined) updateData.generalNotes = generalNotes;
    if (centralOperatorName !== undefined) updateData.centralOperatorName = centralOperatorName;
    if (centralLabel !== undefined) updateData.centralLabel = centralLabel;

    // Handle workflow actions — submit goes directly to "aprobado" (no review step)
    if (action === "submit") {
      const now = new Date();
      updateData.status = "aprobado";
      updateData.submittedAt = now;
      updateData.submittedBy = ctx.userId;
      updateData.approvedAt = now;
      updateData.approvedBy = ctx.userId;
    }

    await prisma.opsControlNocturno.update({
      where: { id },
      data: updateData,
    });

    // Update instalaciones, guardias, rondas
    if (instalaciones) {
      for (const inst of instalaciones) {
        await prisma.opsControlNocturnoInstalacion.update({
          where: { id: inst.id },
          data: {
            guardiasRequeridos: inst.guardiasRequeridos,
            guardiasPresentes: inst.guardiasPresentes,
            horaLlegadaTurnoDia: inst.horaLlegadaTurnoDia,
            guardiaDiaNombres: inst.guardiaDiaNombres,
            statusInstalacion: inst.statusInstalacion,
            notes: inst.notes,
          },
        });

        // Guardias: upsert
        if (inst.guardias) {
          // Delete removed guardias
          const guardiaIds = inst.guardias.filter((g) => g.id).map((g) => g.id as string);
          await prisma.opsControlNocturnoGuardia.deleteMany({
            where: {
              controlInstalacionId: inst.id,
              id: { notIn: guardiaIds },
            },
          });

          for (const guardia of inst.guardias) {
            if (guardia.id) {
              await prisma.opsControlNocturnoGuardia.update({
                where: { id: guardia.id },
                data: {
                  guardiaNombre: guardia.guardiaNombre,
                  guardiaId: guardia.guardiaId || null,
                  isExtra: guardia.isExtra ?? false,
                  horaLlegada: guardia.horaLlegada || null,
                },
              });
            } else {
              await prisma.opsControlNocturnoGuardia.create({
                data: {
                  controlInstalacionId: inst.id,
                  guardiaNombre: guardia.guardiaNombre,
                  guardiaId: guardia.guardiaId || null,
                  isExtra: guardia.isExtra ?? false,
                  horaLlegada: guardia.horaLlegada || null,
                },
              });
            }
          }
        }

        // Rondas: update
        if (inst.rondas) {
          for (const ronda of inst.rondas) {
            await prisma.opsControlNocturnoRonda.update({
              where: { id: ronda.id },
              data: {
                horaMarcada: ronda.horaMarcada,
                status: ronda.status,
                notes: ronda.notes,
              },
            });
          }
        }
      }
    }

    // Fetch updated
    const updated = await prisma.opsControlNocturno.findFirst({
      where: { id, tenantId: ctx.tenantId },
      include: {
        instalaciones: {
          include: {
            guardias: { orderBy: { createdAt: "asc" } },
            rondas: { orderBy: { rondaNumber: "asc" } },
          },
          orderBy: { orderIndex: "asc" },
        },
      },
    });

    await createOpsAuditLog(ctx, action || "update", "control_nocturno", id, { action });

    // Send email on submit or resend (fire-and-forget)
    if (updated && (action === "submit" || action === "resend")) {
      const baseUrl = process.env.NEXTAUTH_URL || "https://opai.gard.cl";

      // Generate AI summary (non-blocking, best-effort)
      const aiSummaryPromise = generateControlNocturnoSummary(
        {
          date: updated.date.toISOString().slice(0, 10),
          centralOperatorName: updated.centralOperatorName,
          totalInstalaciones: updated.instalaciones.length,
          instalaciones: updated.instalaciones.map((inst) => ({
            installationName: inst.installationName,
            statusInstalacion: inst.statusInstalacion,
            notes: inst.notes,
            guardias: inst.guardias.map((g) => ({
              guardiaNombre: g.guardiaNombre,
              horaLlegada: g.horaLlegada,
            })),
            rondas: inst.rondas.map((r) => ({
              rondaNumber: r.rondaNumber,
              horaEsperada: r.horaEsperada,
              horaMarcada: r.horaMarcada,
              status: r.status,
              notes: r.notes,
            })),
          })),
          generalNotes: updated.generalNotes,
        },
        ctx.tenantId,
      ).catch(() => null);

      // Generate PDF inline for attachment
      let pdfBuffer: Uint8Array | undefined;
      try {
        const pdfUrl = new URL(
          `/api/ops/control-nocturno/${id}/export-pdf`,
          baseUrl,
        );
        const pdfRes = await fetch(pdfUrl.toString(), {
          headers: { cookie: request.headers.get("cookie") || "" },
        });
        if (pdfRes.ok) {
          pdfBuffer = new Uint8Array(await pdfRes.arrayBuffer());
        }
      } catch (pdfErr) {
        console.warn("[OPS] Could not generate PDF for email attachment:", pdfErr);
      }

      // Wait for AI summary (runs in parallel with PDF)
      const aiSummary = await aiSummaryPromise;

      const emailData = {
        reporteId: id,
        date: updated.date.toISOString().slice(0, 10),
        centralOperatorName: updated.centralOperatorName,
        centralLabel: updated.centralLabel,
        totalInstalaciones: updated.instalaciones.length,
        novedades: updated.instalaciones.filter(
          (i) => i.statusInstalacion === "novedad",
        ).length,
        criticos: updated.instalaciones.filter(
          (i) => i.statusInstalacion === "critico",
        ).length,
        generalNotes: updated.generalNotes,
        aiSummary,
        baseUrl,
      };

      // Send email (don't block response)
      sendControlNocturnoEmail(emailData, pdfBuffer).catch((err) =>
        console.error("[OPS] Email send error:", err),
      );
    }

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    console.error("[OPS] Error updating control nocturno:", error);
    return NextResponse.json(
      { success: false, error: "No se pudo actualizar el reporte" },
      { status: 500 },
    );
  }
}

/* ── DELETE (solo admin/propietario) ── */

export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await ensureOpsAccess(ctx);
    if (forbidden) return forbidden;

    const perms = await resolveApiPerms(ctx);
    if (!hasCapability(perms, "control_nocturno_delete")) {
      return NextResponse.json(
        { success: false, error: "Solo administradores y propietarios pueden eliminar reportes" },
        { status: 403 },
      );
    }

    const { id } = await params;

    const reporte = await prisma.opsControlNocturno.findFirst({
      where: { id, tenantId: ctx.tenantId },
    });
    if (!reporte) {
      return NextResponse.json({ success: false, error: "Reporte no encontrado" }, { status: 404 });
    }
    if (reporte.status === "aprobado") {
      return NextResponse.json(
        { success: false, error: "No se puede eliminar un reporte aprobado" },
        { status: 400 },
      );
    }

    await prisma.opsControlNocturno.delete({ where: { id } });
    await createOpsAuditLog(ctx, "delete", "control_nocturno", id);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[OPS] Error deleting control nocturno:", error);
    return NextResponse.json(
      { success: false, error: "No se pudo eliminar el reporte" },
      { status: 500 },
    );
  }
}
