import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { ensureOpsAccess } from "@/lib/ops";
import { uploadFile } from "@/lib/storage";
import { calcDocStatus } from "@/lib/docs-operacionales";
import { parseDateOnly } from "@/lib/ops";

const MAX_SIZE = 10 * 1024 * 1024; // 10 MB
const ALLOWED_MIME = ["application/pdf"];

export async function GET() {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await ensureOpsAccess(ctx);
    if (forbidden) return forbidden;

    const docs = await prisma.docOperacional.findMany({
      where: { tenantId: ctx.tenantId, capa: "global" },
      include: {
        tipo: {
          select: { id: true, codigo: true, nombre: true, normativa: true, obligatorio: true, tieneVencimiento: true, diasAlerta: true, order: true },
        },
      },
      orderBy: { tipo: { order: "asc" } },
    });

    const data = docs.map((d) => ({
      id: d.id,
      tipoId: d.tipoId,
      tipo: d.tipo,
      fileName: d.fileName,
      fileUrl: d.fileUrl,
      fileSize: d.fileSize,
      mimeType: d.mimeType,
      issuedAt: d.issuedAt?.toISOString().slice(0, 10) ?? null,
      expiresAt: d.expiresAt?.toISOString().slice(0, 10) ?? null,
      status: d.status,
      notes: d.notes,
      portalClienteVisible: d.portalClienteVisible,
      validatedBy: d.validatedBy,
      validatedAt: d.validatedAt?.toISOString() ?? null,
      createdAt: d.createdAt.toISOString(),
    }));

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("[DOCS-GLOBALES] Error listing:", error);
    return NextResponse.json(
      { success: false, error: "Error al obtener documentos globales" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await ensureOpsAccess(ctx);
    if (forbidden) return forbidden;

    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    let tipoId = formData.get("tipoId") as string | null;
    const customNombre = formData.get("customNombre") as string | null;
    const issuedAtStr = formData.get("issuedAt") as string | null;
    const expiresAtStr = formData.get("expiresAt") as string | null;
    const notes = formData.get("notes") as string | null;
    const tieneVencimientoStr = formData.get("tieneVencimiento") as string | null;

    if (!file) {
      return NextResponse.json({ success: false, error: "Archivo requerido" }, { status: 400 });
    }
    if (!tipoId && !customNombre?.trim()) {
      return NextResponse.json({ success: false, error: "Selecciona un tipo o ingresa un nombre" }, { status: 400 });
    }
    if (!ALLOWED_MIME.includes(file.type)) {
      return NextResponse.json({ success: false, error: "Solo se permiten archivos PDF" }, { status: 400 });
    }
    if (file.size > MAX_SIZE) {
      return NextResponse.json({ success: false, error: "El archivo excede 10 MB" }, { status: 400 });
    }

    let tipo;

    if (tipoId) {
      // Use existing tipo
      tipo = await prisma.tipoDocOperacional.findFirst({
        where: { id: tipoId, tenantId: ctx.tenantId, capa: "global" },
      });
      if (!tipo) {
        return NextResponse.json({ success: false, error: "Tipo de documento inválido" }, { status: 400 });
      }
    } else {
      // Create new custom tipo
      const nombre = customNombre!.trim();
      const codigo = "custom_" + nombre.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/_+$/, "");
      const tieneVencimiento = tieneVencimientoStr === "true";

      // Check if custom tipo already exists
      const existing = await prisma.tipoDocOperacional.findFirst({
        where: { tenantId: ctx.tenantId, codigo },
      });

      if (existing) {
        tipo = existing;
      } else {
        // Get max order for positioning
        const maxOrder = await prisma.tipoDocOperacional.findFirst({
          where: { tenantId: ctx.tenantId, capa: "global" },
          orderBy: { order: "desc" },
          select: { order: true },
        });

        tipo = await prisma.tipoDocOperacional.create({
          data: {
            tenantId: ctx.tenantId,
            codigo,
            nombre,
            capa: "global",
            obligatorio: false,
            tieneVencimiento,
            diasAlerta: tieneVencimiento ? 30 : 0,
            order: (maxOrder?.order ?? 6) + 1,
          },
        });
      }
      tipoId = tipo.id;
    }

    const issuedAt = issuedAtStr ? parseDateOnly(issuedAtStr) : null;
    const expiresAt = expiresAtStr ? parseDateOnly(expiresAtStr) : null;
    const status = calcDocStatus(expiresAt, tipo.tieneVencimiento, tipo.diasAlerta);

    const buffer = Buffer.from(await file.arrayBuffer());
    const uploaded = await uploadFile(buffer, file.name, file.type, "ops-docs");

    const doc = await prisma.docOperacional.create({
      data: {
        tenantId: ctx.tenantId,
        tipoId: tipo.id,
        capa: "global",
        installationId: null,
        fileName: uploaded.fileName,
        fileUrl: uploaded.publicUrl,
        storageKey: uploaded.storageKey,
        fileSize: uploaded.size,
        mimeType: file.type,
        issuedAt,
        expiresAt,
        status,
        notes: notes?.trim() || null,
        portalClienteVisible: true,
        createdBy: ctx.userId,
      },
      include: {
        tipo: {
          select: { id: true, codigo: true, nombre: true, normativa: true, obligatorio: true, tieneVencimiento: true, diasAlerta: true, order: true },
        },
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        id: doc.id,
        tipoId: doc.tipoId,
        tipo: doc.tipo,
        fileName: doc.fileName,
        fileUrl: doc.fileUrl,
        fileSize: doc.fileSize,
        issuedAt: doc.issuedAt?.toISOString().slice(0, 10) ?? null,
        expiresAt: doc.expiresAt?.toISOString().slice(0, 10) ?? null,
        status: doc.status,
        notes: doc.notes,
        portalClienteVisible: doc.portalClienteVisible,
        createdAt: doc.createdAt.toISOString(),
      },
    }, { status: 201 });
  } catch (error) {
    console.error("[DOCS-GLOBALES] Error uploading:", error);
    return NextResponse.json(
      { success: false, error: "No se pudo subir el documento" },
      { status: 500 }
    );
  }
}
