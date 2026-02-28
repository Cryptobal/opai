import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized, resolveApiPerms } from "@/lib/api-auth";
import { canEdit, canView, hasCapability } from "@/lib/permissions";
import { generateTicketCode } from "@/lib/tickets";

type Params = { id: string };

const findingSchema = z.object({
  guardId: z.string().uuid().nullable().optional(),
  category: z.enum(["personal", "infrastructure", "documentation", "operational"]),
  severity: z.enum(["critical", "major", "minor"]),
  description: z.string().min(1).max(2000),
  photoUrl: z.string().url().nullable().optional(),
});

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<Params> },
) {
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

    const { severity, category, description } = parsed.data;

    // Auto-create ticket for critical and major findings
    let ticketId: string | null = null;
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
          const categoryLabels: Record<string, string> = {
            personal: "Personal",
            infrastructure: "Infraestructura",
            documentation: "Documentación",
            operational: "Operativo",
          };

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
                title: `[${severityLabel}] ${categoryLabels[category] ?? category} — ${installationName}`,
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

          // Send notification (non-blocking)
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
        // Ticket creation failure should not block finding creation
        console.warn("[OPS][SUPERVISION] Failed to auto-create ticket for finding:", ticketErr);
      }
    }

    try {
      const finding = await prisma.opsSupervisionFinding.create({
        data: {
          tenantId: ctx.tenantId,
          visitId: id,
          installationId: visit.installationId,
          guardId: parsed.data.guardId ?? null,
          category,
          severity,
          description,
          photoUrl: parsed.data.photoUrl ?? null,
          status: "open",
          ...(ticketId ? { ticketId } : {}),
        },
      });

      return NextResponse.json({ success: true, data: { ...finding, ticketId } }, { status: 201 });
    } catch (tableErr: unknown) {
      // P2021: table does not exist — migration not applied yet
      const errCode = tableErr && typeof tableErr === "object" && "code" in tableErr ? (tableErr as { code: string }).code : "";
      if (errCode !== "P2021") throw tableErr;
      // Return a mock finding so the wizard can continue
      return NextResponse.json({
        success: true,
        data: {
          id: crypto.randomUUID(),
          ...parsed.data,
          visitId: id,
          installationId: visit.installationId,
          status: "open",
          ticketId,
          createdAt: new Date().toISOString(),
        },
      }, { status: 201 });
    }
  } catch (error) {
    console.error("[OPS][SUPERVISION] Error creating finding:", error);
    return NextResponse.json(
      { success: false, error: "No se pudo crear el hallazgo" },
      { status: 500 },
    );
  }
}
