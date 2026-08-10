import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { checkRateLimit } from "@/lib/rate-limit";
import { DEFAULT_MIRROR_CONFIG } from "@/lib/google-workspace/drive-outbox";
import { diagnoseSharedDrive } from "@/lib/google-workspace/drive-shared-drive";

function requireAdmin(
  session: {
    user?: { tenantId?: string | null; role?: string | null; id?: string | null } | null;
  } | null,
) {
  if (!session?.user?.tenantId) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  if (!["owner", "admin"].includes(session.user.role ?? "")) {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return {
    tenantId: session.user.tenantId as string,
    userId: (session.user.id as string) ?? null,
  };
}

export async function POST(request: NextRequest) {
  const session = await auth();
  const gate = requireAdmin(session);
  if ("error" in gate && gate.error) return gate.error;
  const { tenantId, userId } = gate as { tenantId: string; userId: string | null };

  const rl = checkRateLimit(`drive-shared-drive:${tenantId}`, {
    limit: 5,
    windowSeconds: 60,
  });
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Demasiados intentos; esperá un minuto" },
      { status: 429 },
    );
  }

  const body = (await request.json()) as { sharedDriveId?: string };
  const sharedDriveId = body.sharedDriveId?.trim();
  if (!sharedDriveId || !/^[\w-]{10,100}$/.test(sharedDriveId)) {
    return NextResponse.json({ error: "sharedDriveId inválido" }, { status: 400 });
  }

  const diagnosis = await diagnoseSharedDrive(sharedDriveId);
  if (!diagnosis.ok || !diagnosis.startPageToken) {
    const failed = diagnosis.checks.find((c) => !c.ok);
    return NextResponse.json(
      { error: failed?.message ?? "Diagnóstico fallido", diagnosis },
      { status: 400 },
    );
  }

  await prisma.$transaction(async (tx) => {
    await tx.driveFolderCache.deleteMany({ where: { tenantId } });
    await tx.driveExportOutbox.deleteMany({
      where: { tenantId, status: { in: ["PENDING", "ERROR"] } },
    });
    await tx.googleDriveWorkspace.upsert({
      where: { tenantId },
      create: {
        tenantId,
        mode: "SHARED_DRIVE",
        sharedDriveId,
        changesPageToken: diagnosis.startPageToken,
        rootFolderId: sharedDriveId,
        rootFolderName: diagnosis.driveName ?? "OPAI",
        structureVersion: 2,
        mirrorConfig: DEFAULT_MIRROR_CONFIG,
        status: "ACTIVE",
        connectedBy: userId,
        lastIngestError: null,
      },
      update: {
        mode: "SHARED_DRIVE",
        sharedDriveId,
        changesPageToken: diagnosis.startPageToken,
        rootFolderId: sharedDriveId,
        rootFolderName: diagnosis.driveName ?? "OPAI",
        structureVersion: 2,
        status: "ACTIVE",
        connectedBy: userId,
        lastIngestError: null,
        lastIngestAt: null,
      },
    });
    // Auditoría: quién activó qué ID (sin tocar Drive).
    await tx.driveExportOutbox.create({
      data: {
        tenantId,
        docType: "config",
        sourceType: "drive_shared_drive_activate",
        sourceId: `${userId ?? "unknown"}:${sharedDriveId}`,
        fileName: `activate-${sharedDriveId}`,
        targetPath: "_audit",
        status: "SENT",
        sentAt: new Date(),
      },
    });
  });

  return NextResponse.json({
    ok: true,
    mode: "SHARED_DRIVE",
    sharedDriveId,
    sharedDriveName: diagnosis.driveName,
    diagnosis,
  });
}

export async function DELETE() {
  const session = await auth();
  const gate = requireAdmin(session);
  if ("error" in gate && gate.error) return gate.error;
  const tenantId = (gate as { tenantId: string }).tenantId;

  const ws = await prisma.googleDriveWorkspace.findUnique({ where: { tenantId } });
  if (!ws) {
    return NextResponse.json({ error: "Sin workspace Drive" }, { status: 400 });
  }

  await prisma.$transaction([
    prisma.driveFolderCache.deleteMany({ where: { tenantId } }),
    prisma.googleDriveWorkspace.update({
      where: { id: ws.id },
      data: {
        mode: "OAUTH",
        sharedDriveId: null,
        changesPageToken: null,
        lastIngestAt: null,
        lastIngestError: null,
        rootFolderId: null,
      },
    }),
  ]);

  return NextResponse.json({ ok: true, mode: "OAUTH" });
}
