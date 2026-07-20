import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  DEFAULT_MIRROR_CONFIG,
  SUPPORTED_DOC_TYPES,
} from "@/lib/google-workspace/drive-outbox";

export async function GET() {
  const session = await auth();
  if (!session?.user?.tenantId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const tenantId = session.user.tenantId;

  const [ws, recent] = await Promise.all([
    prisma.googleDriveWorkspace.findUnique({ where: { tenantId } }),
    prisma.driveExportOutbox.findMany({
      where: { tenantId },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
  ]);

  const mirrorConfig = {
    ...DEFAULT_MIRROR_CONFIG,
    ...(ws?.mirrorConfig && typeof ws.mirrorConfig === "object"
      ? (ws.mirrorConfig as Record<string, boolean>)
      : {}),
  };

  return NextResponse.json({
    connected: ws?.status === "ACTIVE",
    googleEmail: ws?.googleEmail ?? null,
    status: ws?.status ?? null,
    mirrorConfig,
    supportedDocTypes: SUPPORTED_DOC_TYPES,
    recent,
  });
}

export async function PATCH(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.tenantId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!["owner", "admin"].includes(session.user.role ?? "")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await request.json()) as { mirrorConfig?: Record<string, boolean> };
  if (!body.mirrorConfig || typeof body.mirrorConfig !== "object") {
    return NextResponse.json({ error: "mirrorConfig requerido" }, { status: 400 });
  }

  const ws = await prisma.googleDriveWorkspace.findUnique({
    where: { tenantId: session.user.tenantId },
  });
  if (!ws || ws.status !== "ACTIVE") {
    return NextResponse.json({ error: "Drive no conectado" }, { status: 400 });
  }

  const next = {
    ...DEFAULT_MIRROR_CONFIG,
    ...(typeof ws.mirrorConfig === "object"
      ? (ws.mirrorConfig as Record<string, boolean>)
      : {}),
  };
  for (const key of SUPPORTED_DOC_TYPES) {
    if (typeof body.mirrorConfig[key] === "boolean") {
      next[key] = body.mirrorConfig[key];
    }
  }

  await prisma.googleDriveWorkspace.update({
    where: { id: ws.id },
    data: { mirrorConfig: next },
  });

  return NextResponse.json({ ok: true, mirrorConfig: next });
}
