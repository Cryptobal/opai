import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized, resolveApiPerms } from "@/lib/api-auth";
import { requireTenantModule } from "@/lib/require-module";
import { canEdit } from "@/lib/permissions";

type Params = { id: string };

const resolveSchema = z.object({
  note: z.string().max(2000).optional(),
  resolutionPhotoUrl: z.string().url().optional(),
  verifiedInVisitId: z.string().uuid().optional(),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<Params> },
) {
  const modCheck = await requireTenantModule("ops_supervision");
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

    const bodyRaw = await request.json().catch(() => ({}));
    const parsed = resolveSchema.safeParse(bodyRaw);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: "Datos inválidos", details: parsed.error.flatten() },
        { status: 400 },
      );
    }
    const note = parsed.data.note?.trim() ?? null;

    const finding = await prisma.opsSupervisionFinding.findFirst({
      where: { id, tenantId: ctx.tenantId },
      select: {
        id: true,
        status: true,
        ticketId: true,
        occurrenceCount: true,
        installationId: true,
      },
    });

    if (!finding) {
      return NextResponse.json(
        { success: false, error: "Hallazgo no encontrado" },
        { status: 404 },
      );
    }

    if (finding.status === "resolved" || finding.status === "superseded") {
      return NextResponse.json({ success: true, data: { alreadyResolved: true } });
    }

    const admin = await prisma.admin.findUnique({
      where: { id: ctx.userId },
      select: { name: true, email: true },
    });
    const actorName = admin?.name ?? admin?.email ?? "Usuario";
    const when = new Date();

    await prisma.$transaction(async (tx) => {
      await tx.opsSupervisionFinding.update({
        where: { id: finding.id },
        data: {
          status: "resolved",
          resolvedAt: when,
          updatedAt: when,
          ...(parsed.data.resolutionPhotoUrl
            ? { resolutionPhotoUrl: parsed.data.resolutionPhotoUrl }
            : {}),
          ...(note ? { resolutionNote: note } : {}),
          ...(parsed.data.verifiedInVisitId
            ? { verifiedInVisitId: parsed.data.verifiedInVisitId }
            : {}),
        },
      });

      if (finding.ticketId) {
        const baseNote =
          note ?? "Resuelto manualmente desde la ficha de documentos operativos.";
        const resolutionNotes =
          `${baseNote}` +
          ` — Cerrado por ${actorName} el ${when.toLocaleString("es-CL")}` +
          ` (ocurrencias previas: ${finding.occurrenceCount}).`;

        await tx.opsTicket.update({
          where: { id: finding.ticketId },
          data: {
            status: "resolved",
            resolvedAt: when,
            resolutionNotes,
            updatedAt: when,
          },
        });

        const photoLine = parsed.data.resolutionPhotoUrl
          ? `\n\nFoto de resolución: ${parsed.data.resolutionPhotoUrl}`
          : "";
        const commentBody =
          `✅ Hallazgo resuelto manualmente por ${actorName}.${note ? ` Nota: ${note}` : ""}${photoLine}`.trim();

        await tx.opsTicketComment.create({
          data: {
            ticketId: finding.ticketId,
            userId: ctx.userId,
            body: commentBody,
            isInternal: false,
          },
        });
      }
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[OPS][SUPERVISION] Error resolving finding:", error);
    return NextResponse.json(
      { success: false, error: "No se pudo resolver el hallazgo" },
      { status: 500 },
    );
  }
}
