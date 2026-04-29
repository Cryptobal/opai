import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized, parseBody } from "@/lib/api-auth";

export const dynamic = "force-dynamic";

type Params = { id: string };

/**
 * GET /api/vra/reports/[id]
 * Obtiene un informe completo con todas sus secciones generadas.
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<Params> }) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const { id } = await params;

    const report = await prisma.vraReport.findFirst({
      where: { id, tenantId: ctx.tenantId },
      include: {
        installation: { select: { id: true, name: true, address: true, city: true, lat: true, lng: true } },
        visit: { select: { id: true, checkInAt: true, checkOutAt: true } },
        sections: { orderBy: { sortOrder: "asc" } },
        docOperacional: { select: { id: true, fileName: true, fileUrl: true, status: true } },
      },
    });
    if (!report) {
      return NextResponse.json({ success: false, error: "Informe no encontrado" }, { status: 404 });
    }

    return NextResponse.json({ success: true, report });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

const updateSchema = z.object({
  title: z.string().min(3).max(200).optional(),
  status: z.enum(["draft", "ready", "approved", "sent", "archived"]).optional(),
  portalVisible: z.boolean().optional(),
});

/**
 * PUT /api/vra/reports/[id]
 * Actualiza metadatos del informe (título, status, visibilidad portal).
 */
export async function PUT(request: NextRequest, { params }: { params: Promise<Params> }) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const { id } = await params;

    const parsed = await parseBody(request, updateSchema);
    if (parsed.error) return parsed.error;
    const data = parsed.data;

    const report = await prisma.vraReport.findFirst({
      where: { id, tenantId: ctx.tenantId },
      select: { id: true, status: true },
    });
    if (!report) {
      return NextResponse.json({ success: false, error: "Informe no encontrado" }, { status: 404 });
    }

    const updated = await prisma.vraReport.update({
      where: { id },
      data: {
        title: data.title ?? undefined,
        status: data.status ?? undefined,
        portalVisible: data.portalVisible ?? undefined,
        approvedBy: data.status === "approved" ? ctx.userId : undefined,
        approvedAt: data.status === "approved" ? new Date() : undefined,
      },
    });

    return NextResponse.json({ success: true, report: updated });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

/**
 * DELETE /api/vra/reports/[id]
 * - Por defecto: soft delete (status=archived, portalVisible=false). Cualquier usuario.
 * - Con ?hard=true: borra permanente (informe + secciones + findings + photos + caches).
 *   Solo permitido para owner / admin. NO borra el DocOperacional generado (queda
 *   en el sistema documental como histórico inmutable).
 */
export async function DELETE(request: NextRequest, { params }: { params: Promise<Params> }) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const { id } = await params;
    const url = new URL(request.url);
    const hard = url.searchParams.get("hard") === "true";

    const report = await prisma.vraReport.findFirst({
      where: { id, tenantId: ctx.tenantId },
      select: { id: true, docOperacionalId: true },
    });
    if (!report) {
      return NextResponse.json({ success: false, error: "Informe no encontrado" }, { status: 404 });
    }

    if (hard) {
      // Restringir hard delete a roles administrativos
      const role = ctx.userRole?.toLowerCase();
      if (role !== "owner" && role !== "admin") {
        return NextResponse.json(
          {
            success: false,
            error: "Solo el propietario o un administrador puede eliminar permanentemente un informe.",
          },
          { status: 403 },
        );
      }

      // Cascade Prisma se encarga de sections / findings / photos via onDelete: Cascade.
      // El DocOperacional NO se borra (queda como evidencia en el sistema documental).
      await prisma.vraReport.delete({ where: { id } });

      return NextResponse.json({ success: true, hard: true });
    }

    // Soft delete por defecto
    await prisma.vraReport.update({
      where: { id },
      data: { status: "archived", portalVisible: false },
    });

    return NextResponse.json({ success: true, hard: false });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
