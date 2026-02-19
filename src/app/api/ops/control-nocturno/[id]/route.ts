import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized, resolveApiPerms } from "@/lib/api-auth";
import { hasCapability } from "@/lib/permissions";
import { ensureOpsAccess, createOpsAuditLog } from "@/lib/ops";
import { sendControlNocturnoEmail } from "@/lib/control-nocturno-email";
import { generateControlNocturnoSummary } from "@/lib/control-nocturno-ai";
import { generateControlNocturnoPdfBuffer } from "@/lib/control-nocturno-pdf";
import { getControlNocturnoSnapshot } from "@/lib/control-nocturno-kpis";

type RouteParams = { params: Promise<{ id: string }> };

export const maxDuration = 60;

const RONDA_HOURS = [
  "20:00", "21:00", "22:00", "23:00",
  "00:00", "01:00", "02:00", "03:00",
  "04:00", "05:00", "06:00", "07:00",
];

type RelevoDiaInput = { nombre?: string; hora?: string | null; isExtra?: boolean };

function serializeRelevoDiaList(list: RelevoDiaInput[]): {
  guardiaDiaNombres: string | null;
  horaLlegadaTurnoDia: string | null;
} {
  if (!Array.isArray(list) || list.length === 0) {
    return { guardiaDiaNombres: null, horaLlegadaTurnoDia: null };
  }
  const normalized = list
    .map((item) => ({
      nombre: typeof item.nombre === "string" ? item.nombre.trim() : "",
      hora: typeof item.hora === "string" ? item.hora.trim() : null,
      isExtra: !!item.isExtra,
    }))
    .filter((item) => item.nombre || item.hora);

  if (normalized.length === 0) {
    return { guardiaDiaNombres: null, horaLlegadaTurnoDia: null };
  }
  return {
    guardiaDiaNombres: JSON.stringify(normalized),
    horaLlegadaTurnoDia: normalized[0]?.hora ?? null,
  };
}

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
            installation: {
              select: {
                account: {
                  select: { name: true },
                },
              },
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
      installationId,
      relevoDiaList,
    } = body as {
      action?: string;
      generalNotes?: string;
      centralOperatorName?: string;
      centralLabel?: string;
      installationId?: string;
      relevoDiaList?: RelevoDiaInput[];
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

    if (action === "upsert_day_relief") {
      if (!installationId || !Array.isArray(relevoDiaList)) {
        return NextResponse.json(
          { success: false, error: "installationId y relevoDiaList son requeridos" },
          { status: 400 },
        );
      }

      const installation = await prisma.crmInstallation.findFirst({
        where: {
          id: installationId,
          tenantId: ctx.tenantId,
          isActive: true,
        },
        select: { id: true, name: true },
      });

      if (!installation) {
        return NextResponse.json(
          { success: false, error: "Instalación no encontrada" },
          { status: 404 },
        );
      }

      const serialized = serializeRelevoDiaList(relevoDiaList);
      const existingInst = await prisma.opsControlNocturnoInstalacion.findFirst({
        where: {
          controlNocturnoId: id,
          installationId: installation.id,
        },
        select: { id: true },
      });

      if (existingInst) {
        await prisma.opsControlNocturnoInstalacion.update({
          where: { id: existingInst.id },
          data: {
            guardiaDiaNombres: serialized.guardiaDiaNombres,
            horaLlegadaTurnoDia: serialized.horaLlegadaTurnoDia,
          },
        });
      } else {
        const maxOrder = await prisma.opsControlNocturnoInstalacion.aggregate({
          where: { controlNocturnoId: id },
          _max: { orderIndex: true },
        });

        await prisma.opsControlNocturnoInstalacion.create({
          data: {
            controlNocturnoId: id,
            installationId: installation.id,
            installationName: installation.name,
            orderIndex: (maxOrder._max.orderIndex ?? 0) + 1,
            guardiasRequeridos: 0,
            guardiasPresentes: 0,
            statusInstalacion: "no_aplica",
            guardiaDiaNombres: serialized.guardiaDiaNombres,
            horaLlegadaTurnoDia: serialized.horaLlegadaTurnoDia,
            rondas: {
              create: RONDA_HOURS.map((hora, idx) => ({
                rondaNumber: idx + 1,
                horaEsperada: hora,
                status: "no_aplica",
              })),
            },
          },
        });
      }

      const updatedDayRelief = await prisma.opsControlNocturno.findFirst({
        where: { id, tenantId: ctx.tenantId },
        include: {
          instalaciones: {
            include: {
              guardias: { orderBy: { createdAt: "asc" } },
              rondas: { orderBy: { rondaNumber: "asc" } },
              installation: {
                select: {
                  account: {
                    select: { name: true },
                  },
                },
              },
            },
            orderBy: { orderIndex: "asc" },
          },
        },
      });

      await createOpsAuditLog(ctx, "upsert_day_relief", "control_nocturno", id, {
        installationId,
      });

      return NextResponse.json({ success: true, data: updatedDayRelief });
    }

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
            installation: {
              select: {
                account: {
                  select: { name: true },
                },
              },
            },
          },
          orderBy: { orderIndex: "asc" },
        },
      },
    });

    await createOpsAuditLog(ctx, action || "update", "control_nocturno", id, { action });

    // Send email on submit or resend (must await: serverless kills fire-and-forget on return)
    if (updated && (action === "submit" || action === "resend")) {
      const baseUrl =
        process.env.VERCEL_URL
          ? `https://${process.env.VERCEL_URL}`
          : process.env.NEXTAUTH_URL || "https://opai.gard.cl";

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

      // Generate PDF inline for attachment (direct call, no self-fetch)
      let pdfBuffer: Uint8Array | undefined;
      try {
        pdfBuffer = await Promise.race([
          generateControlNocturnoPdfBuffer(id, ctx.tenantId),
          new Promise<Uint8Array>((_, reject) =>
            setTimeout(() => reject(new Error("PDF generation timeout")), 45_000),
          ),
        ]);
      } catch (pdfErr) {
        console.warn("[OPS] Could not generate PDF for email attachment:", pdfErr);
      }

      // Snapshot ejecutivo para email (semana / MTD / YTD)
      const snapshotPromise = getControlNocturnoSnapshot(ctx.tenantId, updated.date).catch(
        () => null,
      );

      // Wait for background tasks (run in parallel with PDF)
      const [aiSummary, snapshot] = await Promise.all([aiSummaryPromise, snapshotPromise]);

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
        ...(snapshot ? { snapshot } : {}),
        baseUrl,
      };

      // Send email — MUST await: Vercel serverless kills fire-and-forget on return
      try {
        const emailResult = await sendControlNocturnoEmail(emailData, pdfBuffer);
        if (!emailResult.ok) {
          console.error("[OPS] Control nocturno email failed:", emailResult.error);
        }
      } catch (err) {
        console.error("[OPS] Control nocturno email error:", err);
      }
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
