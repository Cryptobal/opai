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
import { enqueueCrmFileToDrive } from "@/lib/google-workspace/drive-enqueue-hooks";
import { assignDocumentoTipo } from "@/modules/crm/documents/licitacion-ingest.service";
import {
  LICITACION_TIPO_CODIGOS,
  isGeneratedProposalFileName,
  resolveLicitacionTipoOnUpload,
} from "@/modules/crm/documents/licitacion-corpus";

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
    const tipoCodigoField = formData.get("tipoCodigo");
    const tipoCodigoExplicit =
      typeof tipoCodigoField === "string" && tipoCodigoField.trim()
        ? tipoCodigoField.trim()
        : null;

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

    const documento = await prisma.documento.create({
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

    const link = await prisma.documentoEnlace.create({
      data: {
        tenantId: ctx.tenantId,
        fileId: documento.id,
        entityType,
        entityId,
        folderId: folderId || null,
      },
    });

    let assignedTipo: { id: string; codigo: string; nombre: string } | null = null;
    if (entityType === "deal") {
      const resolved = tipoCodigoExplicit
        ? resolveLicitacionTipoOnUpload(documento.fileName, tipoCodigoExplicit)
        : isGeneratedProposalFileName(documento.fileName)
          ? LICITACION_TIPO_CODIGOS.otros
          : null;
      if (resolved) {
        try {
          const assigned = await assignDocumentoTipo({
            tenantId: ctx.tenantId,
            fileId: documento.id,
            tipoCodigo: resolved,
          });
          assignedTipo = assigned.tipo;
        } catch (err) {
          console.warn("[CRM] No se pudo clasificar al subir:", err);
        }
      }
    }

    // Espejo Drive (negocios/personas/instalaciones) — no bloquea la respuesta.
    void enqueueCrmFileToDrive({
      tenantId: ctx.tenantId,
      entityType,
      entityId,
      file: {
        id: documento.id,
        storageKey: documento.storageKey,
        fileName: documento.fileName,
        mimeType: documento.mimeType,
      },
    });

    const folder = folderId
      ? await prisma.documentFolder.findUnique({ where: { id: folderId }, select: { name: true } })
      : null;

    return NextResponse.json({
      success: true,
      data: {
        id: documento.id,
        linkId: link.id,
        fileName: documento.fileName,
        mimeType: documento.mimeType,
        size: documento.size,
        publicUrl: result.publicUrl,
        createdAt: documento.createdAt,
        portalVisible: documento.portalVisible,
        folderId: folderId || null,
        folderName: folder?.name ?? null,
        tipoCodigo: assignedTipo?.codigo ?? null,
        tipoNombre: assignedTipo?.nombre ?? null,
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
