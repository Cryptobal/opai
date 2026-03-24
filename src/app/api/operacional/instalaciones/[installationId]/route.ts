import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { ensureOpsAccess } from "@/lib/ops";
import { uploadFile } from "@/lib/storage";
import { calcDocStatus, GUARDIA_TIPO_MAP } from "@/lib/docs-operacionales";
import { parseDateOnly } from "@/lib/ops";

const MAX_SIZE = 10 * 1024 * 1024;
const ALLOWED_MIME = ["application/pdf"];

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ installationId: string }> }
) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await ensureOpsAccess(ctx);
    if (forbidden) return forbidden;

    const { installationId } = await params;

    // Verify installation belongs to tenant
    const inst = await prisma.crmInstallation.findFirst({
      where: { id: installationId, tenantId: ctx.tenantId },
      select: { id: true },
    });
    if (!inst) {
      return NextResponse.json({ success: false, error: "Instalación no encontrada" }, { status: 404 });
    }

    // Get all active tipos
    const tipos = await prisma.tipoDocOperacional.findMany({
      where: { tenantId: ctx.tenantId, isActive: true },
      orderBy: { order: "asc" },
    });

    // Capa 1: Global docs
    const globales = await prisma.docOperacional.findMany({
      where: { tenantId: ctx.tenantId, capa: "global" },
      include: { tipo: { select: { id: true, codigo: true, nombre: true, normativa: true, obligatorio: true, tieneVencimiento: true, diasAlerta: true, order: true } } },
      orderBy: { tipo: { order: "asc" } },
    });

    // Capa 2: Installation docs
    const instalacion = await prisma.docOperacional.findMany({
      where: { tenantId: ctx.tenantId, capa: "instalacion", installationId },
      include: { tipo: { select: { id: true, codigo: true, nombre: true, normativa: true, obligatorio: true, tieneVencimiento: true, diasAlerta: true, order: true } } },
      orderBy: { tipo: { order: "asc" } },
    });

    // Capa 3: Guard docs via assignments
    const asignaciones = await prisma.opsAsignacionGuardia.findMany({
      where: { installationId, isActive: true },
      include: {
        guardia: {
          include: {
            persona: { select: { firstName: true, lastName: true, rut: true } },
            documents: {
              select: { id: true, type: true, status: true, fileUrl: true, issuedAt: true, expiresAt: true },
            },
          },
        },
      },
    });

    const tiposGuardia = tipos.filter((t) => t.capa === "guardia");

    const guardias = asignaciones.map((a) => {
      const g = a.guardia;
      const docs = g.documents;
      let vigentes = 0;
      let faltantes = 0;
      const tiposObligatorios = tiposGuardia.filter((t) => t.obligatorio);

      const documentosPorTipo = tiposObligatorios.map((tipo) => {
        const mappedTypes = GUARDIA_TIPO_MAP[tipo.codigo] ?? [tipo.codigo];
        const found = docs.find((d) => mappedTypes.includes(d.type));
        if (found) {
          const st = calcDocStatus(found.expiresAt, tipo.tieneVencimiento, tipo.diasAlerta);
          if (st === "vigente" || st === "no_aplica") vigentes++;
          return {
            tipoNombre: tipo.nombre,
            tipoCodigo: tipo.codigo,
            status: st,
            expiresAt: found.expiresAt?.toISOString().slice(0, 10) ?? null,
          };
        }
        faltantes++;
        return {
          tipoNombre: tipo.nombre,
          tipoCodigo: tipo.codigo,
          status: "sin_documento" as const,
          expiresAt: null,
        };
      });

      return {
        guardia: {
          id: g.id,
          firstName: g.persona.firstName,
          lastName: g.persona.lastName,
          rut: g.persona.rut,
          faceIdPhotoUrl: g.faceIdPhotoUrl,
        },
        documentos: documentosPorTipo,
        cumplimiento: {
          total: tiposObligatorios.length,
          vigentes,
          faltantes,
        },
      };
    });

    // Cumplimiento calculation
    const tiposGlobal = tipos.filter((t) => t.capa === "global" && t.obligatorio);
    const tiposInst = tipos.filter((t) => t.capa === "instalacion" && t.obligatorio);

    const globalVigentes = tiposGlobal.filter((t) => {
      const doc = globales.find((d) => d.tipoId === t.id);
      return doc && (doc.status === "vigente" || doc.status === "no_aplica");
    }).length;

    const instVigentes = tiposInst.filter((t) => {
      const doc = instalacion.find((d) => d.tipoId === t.id);
      return doc && (doc.status === "vigente" || doc.status === "no_aplica");
    }).length;

    const guardiaVigentes = guardias.reduce((sum, g) => sum + g.cumplimiento.vigentes, 0);
    const guardiaTotal = guardias.reduce((sum, g) => sum + g.cumplimiento.total, 0);

    const total = tiposGlobal.length + tiposInst.length + guardiaTotal;
    const vigentes = globalVigentes + instVigentes + guardiaVigentes;
    const porVencer = [...globales, ...instalacion].filter((d) => d.status === "por_vencer").length;
    const vencidos = [...globales, ...instalacion].filter((d) => d.status === "vencido").length;
    const sinDocumento = (tiposGlobal.length - globales.filter((d) => tiposGlobal.some((t) => t.id === d.tipoId)).length)
      + (tiposInst.length - instalacion.filter((d) => tiposInst.some((t) => t.id === d.tipoId)).length)
      + guardias.reduce((sum, g) => sum + g.cumplimiento.faltantes, 0);

    const formatDoc = (d: typeof globales[number]) => ({
      id: d.id,
      tipoId: d.tipoId,
      tipo: d.tipo,
      fileName: d.fileName,
      fileUrl: d.fileUrl,
      fileSize: d.fileSize,
      issuedAt: d.issuedAt?.toISOString().slice(0, 10) ?? null,
      expiresAt: d.expiresAt?.toISOString().slice(0, 10) ?? null,
      status: d.status,
      notes: d.notes,
      portalClienteVisible: d.portalClienteVisible,
    });

    return NextResponse.json({
      success: true,
      data: {
        cumplimiento: {
          total,
          vigentes,
          porVencer,
          vencidos,
          sinDocumento,
          porcentaje: total > 0 ? Math.round((vigentes / total) * 100) : 100,
        },
        globales: globales.map(formatDoc),
        instalacion: instalacion.map(formatDoc),
        guardias,
        tiposGlobal: tiposGlobal.map((t) => ({ id: t.id, codigo: t.codigo, nombre: t.nombre, normativa: t.normativa })),
        tiposInstalacion: tiposInst.map((t) => ({ id: t.id, codigo: t.codigo, nombre: t.nombre, normativa: t.normativa })),
      },
    });
  } catch (error) {
    console.error("[DOCS-OP-INSTALACION] Error:", error);
    return NextResponse.json({ success: false, error: "Error al obtener documentos" }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ installationId: string }> }
) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await ensureOpsAccess(ctx);
    if (forbidden) return forbidden;

    const { installationId } = await params;

    const inst = await prisma.crmInstallation.findFirst({
      where: { id: installationId, tenantId: ctx.tenantId },
      select: { id: true },
    });
    if (!inst) {
      return NextResponse.json({ success: false, error: "Instalación no encontrada" }, { status: 404 });
    }

    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const tipoId = formData.get("tipoId") as string | null;
    const issuedAtStr = formData.get("issuedAt") as string | null;
    const expiresAtStr = formData.get("expiresAt") as string | null;
    const notes = formData.get("notes") as string | null;

    if (!file) return NextResponse.json({ success: false, error: "Archivo requerido" }, { status: 400 });
    if (!tipoId) return NextResponse.json({ success: false, error: "tipoId requerido" }, { status: 400 });
    if (!ALLOWED_MIME.includes(file.type)) return NextResponse.json({ success: false, error: "Solo se permiten archivos PDF" }, { status: 400 });
    if (file.size > MAX_SIZE) return NextResponse.json({ success: false, error: "El archivo excede 10 MB" }, { status: 400 });

    const tipo = await prisma.tipoDocOperacional.findFirst({
      where: { id: tipoId, tenantId: ctx.tenantId, capa: "instalacion" },
    });
    if (!tipo) {
      return NextResponse.json({ success: false, error: "Tipo de documento inválido para instalación" }, { status: 400 });
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
        capa: "instalacion",
        installationId,
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
        tipo: { select: { id: true, codigo: true, nombre: true, normativa: true, obligatorio: true, tieneVencimiento: true, diasAlerta: true, order: true } },
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
      },
    }, { status: 201 });
  } catch (error) {
    console.error("[DOCS-OP-INSTALACION] Error uploading:", error);
    return NextResponse.json({ success: false, error: "No se pudo subir el documento" }, { status: 500 });
  }
}
