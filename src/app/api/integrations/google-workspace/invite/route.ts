import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isAdminRole } from "@/lib/access";
import { sendGoogleWorkspaceInvite } from "@/lib/google-workspace/send-invite";

const bodySchema = z.object({
  userId: z.string().min(1),
});

/**
 * POST /api/integrations/google-workspace/invite
 * Envía por mail una invitación a un usuario del tenant para conectar
 * Gmail, Drive y Calendar (links a las secciones de configuración).
 * Solo owner/admin.
 */
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.tenantId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isAdminRole(session.user.role ?? "")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "userId requerido" }, { status: 400 });
  }

  const tenantId = session.user.tenantId;
  const invitee = await prisma.admin.findFirst({
    where: {
      id: parsed.data.userId,
      tenantId,
      status: "active",
    },
    select: { id: true, name: true, email: true },
  });
  if (!invitee) {
    return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });
  }

  const result = await sendGoogleWorkspaceInvite({
    tenantId,
    inviterName: session.user.name ?? session.user.email ?? "Un administrador",
    invitee,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 502 });
  }

  await prisma.auditLog.create({
    data: {
      tenantId,
      userId: session.user.id,
      userEmail: session.user.email,
      action: "google_workspace.invite_sent",
      entity: "admin",
      entityId: invitee.id,
      details: { email: invitee.email, links: result.links },
    },
  });

  return NextResponse.json({ ok: true, email: invitee.email });
}
