import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { validateSupervisorSession } from "@/lib/portal-supervisor";

export async function POST(req: Request) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ success: false, error: "Sin sesión" }, { status: 401 });
  }

  const result = await validateSupervisorSession(session);
  if (!result.success || !result.data) {
    return NextResponse.json({ success: false, error: result.error }, { status: 403 });
  }

  const { adminId, tenantId, installations } = result.data;

  let body: {
    installationId: string;
    content: string;
    noteType?: "GENERAL" | "ALERT";
    attachments?: unknown;
  };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, error: "Body inválido" }, { status: 400 });
  }

  const { installationId, content, noteType = "GENERAL", attachments } = body;

  if (!installationId || !content?.trim()) {
    return NextResponse.json(
      { success: false, error: "installationId y content son requeridos" },
      { status: 400 }
    );
  }

  // Verify the supervisor is assigned to this installation
  const isAssigned = installations.some((i) => i.id === installationId);
  if (!isAssigned) {
    return NextResponse.json(
      { success: false, error: "No tienes acceso a esta instalación" },
      { status: 403 }
    );
  }

  const note = await prisma.note.create({
    data: {
      tenantId,
      contextType: "INSTALLATION",
      contextId: installationId,
      authorId: adminId,
      content: content.trim(),
      noteType: noteType as "GENERAL" | "ALERT",
      visibility: "PUBLIC",
      attachments: attachments ?? undefined,
    },
  });

  return NextResponse.json({ success: true, data: { id: note.id } });
}
