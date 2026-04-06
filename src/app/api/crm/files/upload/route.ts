/**
 * API Route: /api/crm/files/upload
 * POST - Subir archivo a R2 y vincularlo a una entidad CRM (lead, deal, account, etc.)
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { requireCrmEdit } from "@/lib/api-auth-crm";
import { uploadFile, STORAGE_PROVIDER } from "@/lib/storage";
import { requireTenantModule } from '@/lib/require-module';

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB
const ALLOWED_MIME = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "application/msword", // .doc
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document", // .docx
  "application/vnd.ms-excel", // .xls
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", // .xlsx
]);

const ALLOWED_ENTITY_TYPES = ["lead", "deal", "account", "contact", "installation", "guardia"] as const;

export async function POST(request: NextRequest) {
  try {
    const modCheck = await requireTenantModule('crm');
    if (!modCheck.authorized) return modCheck.response;

    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await requireCrmEdit(ctx);
    if (forbidden) return forbidden;

    const formData = await request.formData();
    const file = formData.get("file");
    const entityType = formData.get("entityType") as string | null;
    const entityId = formData.get("entityId") as string | null;
    const folderId = formData.get("folderId") as string | null;
    const portalVisible = formData.get("portalVisible") === "true";

    if (!file || !(file instanceof File)) {
      return NextResponse.json(
        { success: false, error: "Archivo requerido (field: file)" },
        { status: 400 }
      );
    }

    if (!entityType || !ALLOWED_ENTITY_TYPES.includes(entityType as (typeof ALLOWED_ENTITY_TYPES)[number])) {
      return NextResponse.json(
        { success: false, error: "entityType requerido (lead, deal, account, contact, installation)" },
        { status: 400 }
      );
    }

    if (!entityId || typeof entityId !== "string") {
      return NextResponse.json(
        { success: false, error: "entityId requerido" },
        { status: 400 }
      );
    }

    if (file.size > MAX_FILE_SIZE_BYTES) {
      return NextResponse.json(
        { success: false, error: "El archivo excede el máximo de 10MB" },
        { status: 400 }
      );
    }

    const mimeType = file.type || "application/octet-stream";
    if (!ALLOWED_MIME.has(mimeType)) {
      return NextResponse.json(
        { success: false, error: "Tipo de archivo no permitido (PDF, imágenes, Word, Excel)" },
        { status: 400 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const result = await uploadFile(buffer, file.name, mimeType, "crm", ctx.tenantId);

    const crmFile = await prisma.crmFile.create({
      data: {
        tenantId: ctx.tenantId,
        fileName: result.fileName,
        mimeType: result.mimeType,
        size: result.size,
        storageProvider: STORAGE_PROVIDER,
        storageKey: result.storageKey,
        portalVisible,
        createdBy: ctx.userId,
      },
    });

    const link = await prisma.crmFileLink.create({
      data: {
        tenantId: ctx.tenantId,
        fileId: crmFile.id,
        entityType,
        entityId,
        folderId: folderId || null,
      },
    });

    const folder = folderId
      ? await prisma.documentFolder.findUnique({ where: { id: folderId }, select: { name: true } })
      : null;

    return NextResponse.json({
      success: true,
      data: {
        id: crmFile.id,
        linkId: link.id,
        fileName: crmFile.fileName,
        mimeType: crmFile.mimeType,
        size: crmFile.size,
        publicUrl: result.publicUrl,
        createdAt: crmFile.createdAt,
        portalVisible: crmFile.portalVisible,
        folderId: folderId || null,
        folderName: folder?.name ?? null,
      },
    }, { status: 201 });
  } catch (error) {
    console.error("[CRM] Error uploading file:", error);
    return NextResponse.json(
      { success: false, error: "Error al subir archivo" },
      { status: 500 }
    );
  }
}
