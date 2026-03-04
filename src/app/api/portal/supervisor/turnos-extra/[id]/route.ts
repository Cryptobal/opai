import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { validateSupervisorSession } from "@/lib/portal-supervisor";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ success: false, error: "Sin sesión" }, { status: 401 });

  const result = await validateSupervisorSession(session);
  if (!result.success || !result.data)
    return NextResponse.json({ success: false, error: result.error }, { status: 403 });

  const { adminId, installations } = result.data;
  const { id } = await params;

  let body: { action: "approve" | "reject"; rejectionReason?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, error: "Body inválido" }, { status: 400 });
  }

  const { action, rejectionReason } = body;

  const te = await prisma.opsTurnoExtra.findUnique({ where: { id } });
  if (!te) return NextResponse.json({ success: false, error: "Turno extra no encontrado" }, { status: 404 });

  const isAssigned = installations.some((i) => i.id === te.installationId);
  if (!isAssigned)
    return NextResponse.json({ success: false, error: "Sin acceso" }, { status: 403 });

  const now = new Date();
  if (action === "approve") {
    await prisma.opsTurnoExtra.update({
      where: { id },
      data: { status: "approved", approvedBy: adminId, approvedAt: now },
    });
  } else if (action === "reject") {
    await prisma.opsTurnoExtra.update({
      where: { id },
      data: {
        status: "rejected",
        rejectedBy: adminId,
        rejectedAt: now,
        rejectionReason: rejectionReason ?? null,
      },
    });
  } else {
    return NextResponse.json({ success: false, error: "Acción inválida" }, { status: 400 });
  }

  return NextResponse.json({ success: true });
}
