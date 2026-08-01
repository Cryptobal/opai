/**
 * POST /api/me/avatar — subir foto de perfil del Admin autenticado.
 * DELETE /api/me/avatar — eliminar foto.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { deleteFile, uploadFile } from "@/lib/storage";
export const runtime = "nodejs";

const MAX_BYTES = 2 * 1024 * 1024; // 2MB
const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

export async function POST(request: NextRequest) {
  const ctx = await requireAuth();
  if (!ctx) return unauthorized();

  try {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json(
        { success: false, error: "Archivo requerido (campo file)" },
        { status: 400 },
      );
    }
    if (!ALLOWED.has(file.type)) {
      return NextResponse.json(
        { success: false, error: "Formato no permitido. Usa JPG, PNG, WEBP o GIF." },
        { status: 400 },
      );
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json(
        { success: false, error: "La foto no puede superar 2 MB" },
        { status: 400 },
      );
    }

    const admin = await prisma.admin.findFirst({
      where: { id: ctx.userId, tenantId: ctx.tenantId },
      select: { id: true, email: true, photoKey: true },
    });
    if (!admin) {
      return NextResponse.json(
        { success: false, error: "Usuario no encontrado" },
        { status: 404 },
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const ext =
      file.type === "image/png"
        ? ".png"
        : file.type === "image/webp"
          ? ".webp"
          : file.type === "image/gif"
            ? ".gif"
            : ".jpg";
    const uploaded = await uploadFile(
      buffer,
      `avatar${ext}`,
      file.type,
      "admins/avatars",
      ctx.tenantId,
    );

    if (!uploaded.publicUrl) {
      return NextResponse.json(
        { success: false, error: "Storage no configurado (R2_PUBLIC_URL)" },
        { status: 500 },
      );
    }

    const updated = await prisma.admin.update({
      where: { id: admin.id },
      data: {
        photoUrl: uploaded.publicUrl,
        photoKey: uploaded.storageKey,
      },
      select: { photoUrl: true },
    });

    // Cache correo: espejar foto Admin para el email del usuario
    const email = admin.email.trim().toLowerCase();
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    await prisma.crmEmailContactAvatar.upsert({
      where: { tenantId_email: { tenantId: ctx.tenantId, email } },
      create: {
        tenantId: ctx.tenantId,
        email,
        photoUrl: uploaded.publicUrl,
        source: "admin",
        expiresAt,
      },
      update: {
        photoUrl: uploaded.publicUrl,
        source: "admin",
        checkedAt: new Date(),
        expiresAt,
      },
    });

    if (admin.photoKey && admin.photoKey !== uploaded.storageKey) {
      try {
        await deleteFile(admin.photoKey);
      } catch (err) {
        console.warn("[ME/AVATAR] No se pudo borrar foto anterior:", err);
      }
    }

    await prisma.auditLog.create({
      data: {
        tenantId: ctx.tenantId,
        userId: ctx.userId,
        userEmail: ctx.userEmail,
        action: "user.avatar_updated",
        entity: "user",
        entityId: admin.id,
      },
    }).catch(() => undefined);

    return NextResponse.json({ success: true, data: { photoUrl: updated.photoUrl } });
  } catch (err) {
    console.error("[ME/AVATAR] upload error:", err);
    return NextResponse.json(
      { success: false, error: "No se pudo subir la foto" },
      { status: 500 },
    );
  }
}

export async function DELETE() {
  const ctx = await requireAuth();
  if (!ctx) return unauthorized();

  try {
    const admin = await prisma.admin.findFirst({
      where: { id: ctx.userId, tenantId: ctx.tenantId },
      select: { id: true, email: true, photoKey: true },
    });
    if (!admin) {
      return NextResponse.json(
        { success: false, error: "Usuario no encontrado" },
        { status: 404 },
      );
    }

    await prisma.admin.update({
      where: { id: admin.id },
      data: { photoUrl: null, photoKey: null },
    });

    const email = admin.email.trim().toLowerCase();
    await prisma.crmEmailContactAvatar.deleteMany({
      where: { tenantId: ctx.tenantId, email, source: "admin" },
    });

    if (admin.photoKey) {
      try {
        await deleteFile(admin.photoKey);
      } catch (err) {
        console.warn("[ME/AVATAR] No se pudo borrar de R2:", err);
      }
    }

    await prisma.auditLog.create({
      data: {
        tenantId: ctx.tenantId,
        userId: ctx.userId,
        userEmail: ctx.userEmail,
        action: "user.avatar_deleted",
        entity: "user",
        entityId: admin.id,
      },
    }).catch(() => undefined);

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[ME/AVATAR] delete error:", err);
    return NextResponse.json(
      { success: false, error: "No se pudo eliminar la foto" },
      { status: 500 },
    );
  }
}
