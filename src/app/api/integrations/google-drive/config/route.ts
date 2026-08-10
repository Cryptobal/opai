import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  DEFAULT_MIRROR_CONFIG,
  SUPPORTED_DOC_TYPES,
} from "@/lib/google-workspace/drive-outbox";
import { getTenantModulesList } from "@/lib/tenant-modules";
import { DEFAULT_ROOT_NAME } from "@/lib/google-workspace/drive.service";
import { listDuplicateRoots } from "@/lib/google-workspace/drive-migrate-structure";

function requireAdmin(
  session: { user?: { tenantId?: string | null; role?: string | null } | null } | null,
) {
  if (!session?.user?.tenantId) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  if (!["owner", "admin"].includes(session.user.role ?? "")) {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return { tenantId: session.user.tenantId as string };
}

export async function GET() {
  const session = await auth();
  const gate = requireAdmin(session);
  if ("error" in gate && gate.error) return gate.error;
  const tenantId = gate.tenantId!;

  const [ws, recent, enabledModules] = await Promise.all([
    prisma.googleDriveWorkspace.findUnique({ where: { tenantId } }),
    prisma.driveExportOutbox.findMany({
      where: { tenantId },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
    getTenantModulesList(tenantId),
  ]);

  const mirrorConfig = {
    ...DEFAULT_MIRROR_CONFIG,
    ...(ws?.mirrorConfig && typeof ws.mirrorConfig === "object"
      ? (ws.mirrorConfig as Record<string, boolean>)
      : {}),
  };

  const rootFolderId = ws?.rootFolderId ?? null;
  const rootFolderName = ws?.rootFolderName?.trim() || DEFAULT_ROOT_NAME;

  let duplicateRoots: Awaited<ReturnType<typeof listDuplicateRoots>> | null = null;
  if (ws?.status === "ACTIVE") {
    try {
      duplicateRoots = await listDuplicateRoots(tenantId);
    } catch (err) {
      console.warn("[drive] listDuplicateRoots:", err);
    }
  }

  return NextResponse.json({
    connected: ws?.status === "ACTIVE",
    googleEmail: ws?.googleEmail ?? null,
    status: ws?.status ?? null,
    mirrorConfig,
    supportedDocTypes: SUPPORTED_DOC_TYPES,
    recent,
    rootFolderId,
    rootFolderName,
    rootFolderUrl: rootFolderId
      ? `https://drive.google.com/drive/folders/${rootFolderId}`
      : null,
    structureVersion: ws?.structureVersion ?? 1,
    enabledModules,
    duplicateRootCount: duplicateRoots
      ? duplicateRoots.duplicates.length + (duplicateRoots.rootFolderId ? 1 : 0)
      : 0,
    duplicateRoots: duplicateRoots?.duplicates ?? [],
  });
}

export async function PATCH(request: NextRequest) {
  const session = await auth();
  const gate = requireAdmin(session);
  if ("error" in gate && gate.error) return gate.error;
  const tenantId = gate.tenantId!;

  const body = (await request.json()) as {
    mirrorConfig?: Record<string, boolean>;
    rootFolderName?: string;
  };

  const ws = await prisma.googleDriveWorkspace.findUnique({
    where: { tenantId },
  });
  if (!ws || ws.status !== "ACTIVE") {
    return NextResponse.json({ error: "Drive no conectado" }, { status: 400 });
  }

  const data: { mirrorConfig?: Record<string, boolean>; rootFolderName?: string } = {};

  if (body.mirrorConfig && typeof body.mirrorConfig === "object") {
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
    data.mirrorConfig = next;
  }

  if (typeof body.rootFolderName === "string" && body.rootFolderName.trim()) {
    data.rootFolderName = body.rootFolderName.trim().slice(0, 80);
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "Nada que actualizar" }, { status: 400 });
  }

  const updated = await prisma.googleDriveWorkspace.update({
    where: { id: ws.id },
    data,
  });

  return NextResponse.json({
    ok: true,
    mirrorConfig: data.mirrorConfig ?? updated.mirrorConfig,
    rootFolderName: updated.rootFolderName ?? DEFAULT_ROOT_NAME,
  });
}
