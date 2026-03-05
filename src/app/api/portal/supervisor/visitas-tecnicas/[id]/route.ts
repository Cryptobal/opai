import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { validateSupervisorSession } from "@/lib/portal-supervisor";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false, error: "No autorizado" }, { status: 401 });

  const result = await validateSupervisorSession(session);
  if (!result.success || !result.data) return NextResponse.json({ success: false, error: result.error }, { status: 403 });

  const { adminId } = result.data;

  const visita = await prisma.opsVisitaTecnica.findFirst({
    where: { id, userId: adminId },
    include: {
      installation: { select: { id: true, name: true, address: true } },
      account: { select: { id: true, name: true } },
      deal: { select: { id: true, title: true } },
    },
  });

  if (!visita) return NextResponse.json({ success: false, error: "No encontrado" }, { status: 404 });

  return NextResponse.json({ success: true, data: visita });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false, error: "No autorizado" }, { status: 401 });

  const result = await validateSupervisorSession(session);
  if (!result.success || !result.data) return NextResponse.json({ success: false, error: result.error }, { status: 403 });

  const { adminId } = result.data;

  const existing = await prisma.opsVisitaTecnica.findFirst({ where: { id, userId: adminId } });
  if (!existing) return NextResponse.json({ success: false, error: "No encontrado" }, { status: 404 });

  const body = await req.json();

  // Strip non-updatable fields
  const { id: _id, tenantId: _t, userId: _u, createdAt: _c, ...updateData } = body;

  // Handle check-in
  if (body.checkIn === true && !existing.checkInAt) {
    updateData.checkInAt = new Date();
    updateData.status = "en_curso";
    delete updateData.checkIn;
  }

  // Handle check-out / complete
  if (body.complete === true) {
    updateData.checkOutAt = new Date();
    updateData.status = "completada";
    if (existing.checkInAt) {
      const diffMs = Date.now() - new Date(existing.checkInAt).getTime();
      updateData.durationMinutes = Math.round(diffMs / 60000);
    }
    delete updateData.complete;
  }

  const updated = await prisma.opsVisitaTecnica.update({
    where: { id },
    data: updateData,
  });

  return NextResponse.json({ success: true, data: updated });
}
