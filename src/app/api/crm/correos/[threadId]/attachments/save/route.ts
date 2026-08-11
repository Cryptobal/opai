import { NextRequest, NextResponse } from "next/server";
import { requireCorreosAccess } from "@/lib/api-auth-productividad";
import { resolveApiPerms } from "@/lib/api-auth";
import { canEdit, canEditInstallations } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { auditEmailAction } from "@/lib/audit-email";
import { auth } from "@/lib/auth";
import { deleteFile } from "@/lib/storage";
import {
  normalizeSaveItems,
  saveThreadAttachments,
  type SaveEntityType,
} from "@/modules/crm/email/save-attachments";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Ctx = { params: Promise<{ threadId: string }> };

/**
 * DELETE — quita un adjunto ya guardado en OPAI (Documento con procedencia
 * de este hilo). No borra el adjunto del correo Gmail; solo la copia en
 * Documentos CRM. Mismo gate de edición que el POST de guardado.
 */
export async function DELETE(req: NextRequest, ctx: Ctx) {
  const mod = await requireCorreosAccess("edit");
  if (!mod.authorized) return mod.response;
  const { tenantId, userId } = mod.ctx;
  const { threadId } = await ctx.params;
  const fileId = req.nextUrl.searchParams.get("fileId")?.trim();
  if (!fileId) {
    return NextResponse.json({ error: "fileId requerido" }, { status: 400 });
  }

  const file = await prisma.documento.findFirst({
    where: {
      id: fileId,
      tenantId,
      sourceThreadId: threadId,
      sourceType: "email",
    },
    select: { id: true, storageKey: true, fileName: true },
  });
  if (!file) {
    return NextResponse.json(
      { error: "Adjunto guardado no encontrado en este hilo" },
      { status: 404 },
    );
  }

  // Quitar asociación CRM: links + objeto (procedencia email de este hilo).
  await prisma.documentoEnlace.deleteMany({
    where: { tenantId, fileId: file.id },
  });
  if (file.storageKey) {
    try {
      await deleteFile(file.storageKey);
    } catch {
      // El registro igual se elimina; basura en R2 la limpia el cron.
    }
  }
  await prisma.documento.delete({ where: { id: file.id } });

  const session = await auth();
  void auditEmailAction({
    tenantId,
    userId,
    userEmail: session?.user?.email,
    action: "unsave_attachment",
    entityType: "email_thread",
    entityId: threadId,
    meta: { fileId: file.id, fileName: file.fileName },
  });

  return NextResponse.json({ success: true });
}

/**
 * POST — guarda uno o varios adjuntos del correo como Documentos de una
 * entidad (negocio/cuenta/instalación), en una carpeta opcional. Dedupe por
 * hash de contenido, procedencia al hilo y respuesta por ítem. Retrocompatible
 * con el body de un solo adjunto. Los negocios se espejan a Drive.
 */
export async function POST(req: NextRequest, ctx: Ctx) {
  const mod = await requireCorreosAccess("edit");
  if (!mod.authorized) return mod.response;
  const { tenantId, userId } = mod.ctx;
  const perms = await resolveApiPerms(mod.ctx);

  const { threadId } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as {
    items?: unknown;
    messageId?: string;
    attachmentId?: string;
    filename?: string;
    size?: number;
    dealId?: string;
    accountId?: string;
    installationId?: string;
    folderId?: string | null;
    portalVisible?: boolean;
  };

  const items = normalizeSaveItems(body);
  if (items.length === 0) {
    return NextResponse.json({ error: "Sin adjuntos para guardar" }, { status: 400 });
  }

  // ── Resolver + validar entidad destino (siempre dentro del tenant) ──
  let entityType: SaveEntityType;
  let entityId: string;
  let enqueueDrive = false;

  if (body.dealId) {
    if (!canEdit(perms, "crm", "deals")) {
      return NextResponse.json({ error: "Sin permisos para editar el negocio" }, { status: 403 });
    }
    const deal = await prisma.crmDeal.findFirst({
      where: { id: body.dealId, tenantId },
      select: { id: true, accountId: true },
    });
    if (!deal) return NextResponse.json({ error: "Negocio no encontrado" }, { status: 404 });
    if (body.accountId && deal.accountId !== body.accountId) {
      return NextResponse.json({ error: "El negocio no pertenece a la cuenta" }, { status: 400 });
    }
    entityType = "deal";
    entityId = deal.id;
    enqueueDrive = true;
  } else if (body.accountId) {
    if (!canEdit(perms, "crm", "accounts")) {
      return NextResponse.json({ error: "Sin permisos para editar la cuenta" }, { status: 403 });
    }
    const account = await prisma.crmAccount.findFirst({
      where: { id: body.accountId, tenantId },
      select: { id: true },
    });
    if (!account) return NextResponse.json({ error: "Cuenta no encontrada" }, { status: 404 });
    entityType = "account";
    entityId = account.id;
  } else if (body.installationId) {
    if (!canEditInstallations(perms)) {
      return NextResponse.json({ error: "Sin permisos para editar la instalación" }, { status: 403 });
    }
    const inst = await prisma.crmInstallation.findFirst({
      where: { id: body.installationId, tenantId },
      select: { id: true },
    });
    if (!inst) return NextResponse.json({ error: "Instalación no encontrada" }, { status: 404 });
    entityType = "installation";
    entityId = inst.id;
  } else {
    return NextResponse.json({ error: "Indicá una cuenta, un negocio o una instalación" }, { status: 400 });
  }

  // ── Validar carpeta contra tenant + entidad destino ──
  let folderId: string | null = null;
  if (typeof body.folderId === "string" && body.folderId) {
    const folder = await prisma.documentFolder.findFirst({
      where: { id: body.folderId, tenantId, entityType, entityId },
      select: { id: true },
    });
    if (!folder) return NextResponse.json({ error: "Carpeta no válida" }, { status: 400 });
    folderId = folder.id;
  }

  const results = await saveThreadAttachments({
    tenantId,
    userId,
    threadId,
    entityType,
    entityId,
    folderId,
    portalVisible: body.portalVisible === true,
    enqueueDrive,
    items,
    deadlineMs: Date.now() + 50_000,
  });

  const savedCount = results.filter((r) => r.status === "saved").length;
  if (savedCount > 0) {
    const session = await auth();
    void auditEmailAction({
      tenantId,
      userId,
      userEmail: session?.user?.email,
      action: "save_attachment",
      entityType: "email_thread",
      entityId: threadId,
      meta: { entityType, entityId, saved: savedCount, total: results.length },
    });
  }

  // Retrocompat: además de `results`, exponer el resultado del primer ítem en
  // el nivel superior (`already`/`fileId`) para clientes del body legacy.
  const first = results[0];
  return NextResponse.json({
    ok: true,
    results,
    already: first?.status === "already",
    fileId: first?.fileId,
  });
}
