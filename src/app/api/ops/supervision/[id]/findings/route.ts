import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized, resolveApiPerms } from "@/lib/api-auth";
import { requireTenantModule } from '@/lib/require-module';
import { canEdit, canView, hasCapability } from "@/lib/permissions";
import { generateTicketCode } from "@/lib/tickets";

type Params = { id: string };

const findingSchema = z.object({
  guardId: z.string().uuid().nullable().optional(),
  category: z.enum(["personal", "infrastructure", "documentation", "operational"]),
  severity: z.enum(["critical", "major", "minor"]),
  description: z.string().min(1).max(2000),
  photoUrl: z.string().url().nullable().optional(),
  tipoDocId: z.string().uuid().nullable().optional(),
  guardiaDocCode: z.string().max(200).nullable().optional(),
});

const ESCALATION_THRESHOLD = 3;

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<Params> },
) {
  const modCheck = await requireTenantModule('ops_supervision');
  if (!modCheck.authorized) return modCheck.response;
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await resolveApiPerms(ctx);

    if (!canView(perms, "ops", "supervision")) {
      return NextResponse.json(
        { success: false, error: "Sin permisos" },
        { status: 403 },
      );
    }

    const { id } = await params;
    const canViewAll = hasCapability(perms, "supervision_view_all");

    const visit = await prisma.opsVisitaSupervision.findFirst({
      where: {
        id,
        tenantId: ctx.tenantId,
        ...(canViewAll ? {} : { supervisorId: ctx.userId }),
      },
      select: { id: true, installationId: true },
    });

    if (!visit) {
      return NextResponse.json(
        { success: false, error: "Visita no encontrada" },
        { status: 404 },
      );
    }

    let findings: unknown[] = [];
    try {
      findings = await prisma.opsSupervisionFinding.findMany({
        where: { visitId: id, tenantId: ctx.tenantId },
        orderBy: { createdAt: "desc" },
      });
    } catch (tableErr: unknown) {
      // P2021: table does not exist — migration not applied yet
      const code = tableErr && typeof tableErr === "object" && "code" in tableErr ? (tableErr as { code: string }).code : "";
      if (code !== "P2021") throw tableErr;
    }

    return NextResponse.json({ success: true, data: findings });
  } catch (error) {
    console.error("[OPS][SUPERVISION] Error fetching findings:", error);
    return NextResponse.json(
      { success: false, error: "No se pudieron obtener los hallazgos" },
      { status: 500 },
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<Params> },
) {
  const modCheck = await requireTenantModule('ops_supervision');
  if (!modCheck.authorized) return modCheck.response;
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await resolveApiPerms(ctx);

    if (!canEdit(perms, "ops", "supervision")) {
      return NextResponse.json(
        { success: false, error: "Sin permisos" },
        { status: 403 },
      );
    }

    const { id } = await params;
    const canViewAll = hasCapability(perms, "supervision_view_all");

    const visit = await prisma.opsVisitaSupervision.findFirst({
      where: {
        id,
        tenantId: ctx.tenantId,
        ...(canViewAll ? {} : { supervisorId: ctx.userId }),
      },
      select: { id: true, installationId: true },
    });

    if (!visit) {
      return NextResponse.json(
        { success: false, error: "Visita no encontrada" },
        { status: 404 },
      );
    }

    const bodyRaw = await request.json();
    const parsed = findingSchema.safeParse(bodyRaw);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: "Datos inválidos", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    // Get installation name for ticket title
    let installationName = "Instalación";
    try {
      const inst = await prisma.crmInstallation.findUnique({
        where: { id: visit.installationId },
        select: { name: true },
      });
      if (inst) installationName = inst.name;
    } catch { /* ignore */ }

    const { severity, category, description, tipoDocId, guardiaDocCode, guardId } = parsed.data;

    // Supervisor name para los comentarios del ticket
    let supervisorName = "Supervisor";
    try {
      const sup = await prisma.admin.findUnique({
        where: { id: ctx.userId },
        select: { name: true },
      });
      if (sup?.name) supervisorName = sup.name;
    } catch { /* ignore */ }

    // 1) Dedup: ¿ya existe un hallazgo abierto para este (installation + tipoDoc|guardiaDocCode)?
    let existingFinding: {
      id: string;
      ticketId: string | null;
      occurrenceCount: number;
      firstDetectedAt: Date;
      severity: string;
    } | null = null;

    if (tipoDocId || guardiaDocCode) {
      try {
        existingFinding = await prisma.opsSupervisionFinding.findFirst({
          where: {
            tenantId: ctx.tenantId,
            installationId: visit.installationId,
            status: { in: ["open", "in_progress"] },
            ...(tipoDocId
              ? { tipoDocId }
              : {
                  guardiaDocCode: guardiaDocCode!,
                  guardId: guardId ?? null,
                }),
          },
          select: {
            id: true,
            ticketId: true,
            occurrenceCount: true,
            firstDetectedAt: true,
            severity: true,
          },
          orderBy: { firstDetectedAt: "asc" },
        });
      } catch {
        existingFinding = null;
      }
    }

    // --- CAMINO A: ya existe → incrementar contador, actualizar timestamps, comentar ticket, escalar si aplica ---
    if (existingFinding) {
      const newCount = existingFinding.occurrenceCount + 1;
      const now = new Date();

      const updated = await prisma.opsSupervisionFinding.update({
        where: { id: existingFinding.id },
        data: {
          occurrenceCount: newCount,
          lastDetectedAt: now,
          lastDetectedVisitId: id,
          // Mantener la severidad original a menos que escalemos más abajo.
        },
      });

      // Comentar el ticket (si lo tiene)
      let ticketCode: string | null = null;
      if (existingFinding.ticketId) {
        try {
          await prisma.opsTicketComment.create({
            data: {
              ticketId: existingFinding.ticketId,
              userId: ctx.userId,
              body: `Hallazgo detectado nuevamente en supervisión del ${now.toLocaleDateString("es-CL")} por ${supervisorName}. Ocurrencia #${newCount}.`,
              isInternal: false,
            },
          });
        } catch (commentErr) {
          console.warn("[OPS][SUPERVISION] No se pudo comentar el ticket:", commentErr);
        }

        const tkt = await prisma.opsTicket.findUnique({
          where: { id: existingFinding.ticketId },
          select: { code: true, priority: true, status: true },
        });
        ticketCode = tkt?.code ?? null;

        // Escalar prioridad a p1 cuando se alcanza/supera el umbral y aún no está en p1
        if (
          tkt &&
          newCount >= ESCALATION_THRESHOLD &&
          tkt.priority !== "p1" &&
          tkt.status !== "closed" &&
          tkt.status !== "cancelled"
        ) {
          try {
            await prisma.opsTicket.update({
              where: { id: existingFinding.ticketId },
              data: {
                priority: "p1",
                tags: { push: "escalated_recurring" },
              },
            });

            await prisma.opsTicketComment.create({
              data: {
                ticketId: existingFinding.ticketId,
                userId: ctx.userId,
                body: `Escalado automáticamente a P1 por recurrencia (${newCount} visitas consecutivas con el mismo hallazgo).`,
                isInternal: true,
              },
            });

            import("@/lib/notification-service").then(({ sendNotificationToUsers }) => {
              sendNotificationToUsers({
                tenantId: ctx.tenantId,
                type: "ticket_created",
                title: `Ticket escalado a P1 por recurrencia`,
                message: `${installationName}: ${description.slice(0, 100)} — ${newCount} visitas.`,
                data: { ticketId: existingFinding!.ticketId, code: ticketCode },
                link: `/ops/tickets/${existingFinding!.ticketId}`,
                targetUserIds: [ctx.userId],
              }).catch(() => { /* non-blocking */ });
            }).catch(() => { /* non-blocking */ });
          } catch (escErr) {
            console.warn("[OPS][SUPERVISION] Fallo al escalar ticket:", escErr);
          }
        }
      }

      return NextResponse.json(
        {
          success: true,
          data: {
            ...updated,
            ticketId: existingFinding.ticketId,
            ticketCode,
            deduplicated: true,
            occurrenceCount: newCount,
          },
        },
        { status: 200 },
      );
    }

    // --- CAMINO B: no existe → crear finding + ticket nuevo ---
    let ticketId: string | null = null;
    let ticketCode: string | null = null;
    if (severity === "critical" || severity === "major") {
      try {
        const ticketSlug = severity === "critical" ? "hallazgo_supervision_critico" : "hallazgo_supervision";
        const ticketType = await prisma.opsTicketType.findFirst({
          where: { tenantId: ctx.tenantId, slug: ticketSlug, isActive: true },
          select: { id: true, defaultPriority: true, assignedTeam: true, slaHours: true },
        });

        if (ticketType) {
          const slaDueAt = new Date(Date.now() + ticketType.slaHours * 60 * 60 * 1000);
          const severityLabel = severity === "critical" ? "CRÍTICO" : "MAYOR";

          // Resolver label legible del hallazgo para el título del ticket.
          // Jerarquía: tipoDoc.nombre > guardiaDocCode (mapeado) > descripción truncada.
          let findingLabel: string | null = null;

          if (tipoDocId) {
            try {
              const tipoDoc = await prisma.tipoDocOperacional.findUnique({
                where: { id: tipoDocId },
                select: { nombre: true },
              });
              if (tipoDoc?.nombre) findingLabel = tipoDoc.nombre;
            } catch { /* noop */ }
          }

          if (!findingLabel && guardiaDocCode) {
            const GUARDIA_DOC_LABELS: Record<string, string> = {
              os10: "OS10",
              cedula: "Cédula de identidad",
              contrato: "Contrato de trabajo",
              afp: "AFP",
              isapre: "ISAPRE / Fonasa",
              licencia: "Licencia de conducir",
              antecedentes: "Certificado de antecedentes",
              examen_preocupacional: "Examen preocupacional",
              curso_os10: "Curso OS10",
              libro_novedades: "Libro de novedades",
            };
            findingLabel = GUARDIA_DOC_LABELS[guardiaDocCode] ?? guardiaDocCode;
          }

          if (!findingLabel) {
            const desc = description.trim().replace(/\s+/g, " ");
            findingLabel = desc.length > 60 ? `${desc.slice(0, 57)}…` : desc;
          }

          const titleNew = `[${severityLabel}] ${findingLabel} — ${installationName}`;

          const ticket = await prisma.$transaction(async (tx) => {
            const lastTicket = await tx.opsTicket.findFirst({
              where: { tenantId: ctx.tenantId },
              orderBy: { createdAt: "desc" },
              select: { code: true },
            });
            const lastSeq = lastTicket?.code
              ? parseInt(lastTicket.code.split("-").pop() ?? "0", 10)
              : 0;
            const code = generateTicketCode(lastSeq + 1);

            return tx.opsTicket.create({
              data: {
                tenantId: ctx.tenantId,
                code,
                ticketTypeId: ticketType.id,
                status: "open",
                priority: ticketType.defaultPriority,
                title: titleNew,
                description: `Hallazgo detectado durante supervisión:\n\n${description}`,
                assignedTeam: ticketType.assignedTeam,
                installationId: visit.installationId,
                source: "system",
                reportedBy: ctx.userId,
                slaDueAt,
                slaBreached: false,
                tags: ["supervision", `hallazgo_${severity}`],
              },
              select: { id: true, code: true },
            });
          });

          ticketId = ticket.id;
          ticketCode = ticket.code;

          import("@/lib/notification-service").then(({ sendNotificationToUsers }) => {
            sendNotificationToUsers({
              tenantId: ctx.tenantId,
              type: "ticket_created",
              title: `Hallazgo ${severityLabel} en supervisión`,
              message: `${installationName}: ${description.slice(0, 100)}`,
              data: { ticketId: ticket.id, code: ticket.code },
              link: `/ops/tickets/${ticket.id}`,
              targetUserIds: [ctx.userId],
            }).catch(() => { /* non-blocking */ });
          }).catch(() => { /* non-blocking */ });
        }
      } catch (ticketErr) {
        console.warn("[OPS][SUPERVISION] Failed to auto-create ticket for finding:", ticketErr);
      }
    }

    try {
      const nowCreate = new Date();
      const finding = await prisma.opsSupervisionFinding.create({
        data: {
          tenantId: ctx.tenantId,
          visitId: id,
          installationId: visit.installationId,
          guardId: guardId ?? null,
          category,
          severity,
          description,
          photoUrl: parsed.data.photoUrl ?? null,
          status: "open",
          tipoDocId: tipoDocId ?? null,
          guardiaDocCode: guardiaDocCode ?? null,
          occurrenceCount: 1,
          firstDetectedAt: nowCreate,
          lastDetectedAt: nowCreate,
          lastDetectedVisitId: id,
          ...(ticketId ? { ticketId } : {}),
        },
      });

      return NextResponse.json(
        { success: true, data: { ...finding, ticketId, ticketCode, deduplicated: false, occurrenceCount: 1 } },
        { status: 201 },
      );
    } catch (tableErr: unknown) {
      const errCode = tableErr && typeof tableErr === "object" && "code" in tableErr ? (tableErr as { code: string }).code : "";
      if (errCode !== "P2021") throw tableErr;
      return NextResponse.json(
        {
          success: true,
          data: {
            id: crypto.randomUUID(),
            ...parsed.data,
            visitId: id,
            installationId: visit.installationId,
            status: "open",
            ticketId,
            ticketCode,
            deduplicated: false,
            occurrenceCount: 1,
            createdAt: new Date().toISOString(),
          },
        },
        { status: 201 },
      );
    }
  } catch (error) {
    console.error("[OPS][SUPERVISION] Error creating finding:", error);
    return NextResponse.json(
      { success: false, error: "No se pudo crear el hallazgo" },
      { status: 500 },
    );
  }
}
