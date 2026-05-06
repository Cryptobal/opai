/**
 * POST / DELETE /api/finance/config/dte-provider/certificate
 *
 * POST: sube un .pfx + password, lo valida (parsePfx), encripta el binario y
 *       el password con DTE_ENCRYPTION_KEY (AES-256-GCM) y persiste en
 *       TenantDteCertificate (upsert por tenantId).
 * DELETE: elimina el certificado del tenant.
 *
 * SECURITY:
 *  - El binario nunca se almacena sin encriptar.
 *  - El password se almacena cifrado y solo se desencripta en memoria al firmar
 *    un DTE.
 *  - Antes de aceptar el upload se valida que el certificado esté vigente.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorized, resolveApiPerms } from "@/lib/api-auth";
import { hasFacturacionCapability } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { encryptBuffer, encryptString } from "@/lib/dte-encryption";
import { parsePfx, PfxParseError } from "@/lib/dte-pfx-parser";

const MAX_PFX_SIZE = 200 * 1024; // 200 KB — los .pfx típicos son <50KB

export async function POST(request: NextRequest) {
  const ctx = await requireAuth();
  if (!ctx) return unauthorized();
  const perms = await resolveApiPerms(ctx);
  if (!hasFacturacionCapability(perms, "facturacion_configure")) {
    return NextResponse.json(
      { success: false, error: "Sin permisos" },
      { status: 403 }
    );
  }

  const formData = await request.formData();
  const file = formData.get("file");
  const password = formData.get("password");

  if (!(file instanceof File)) {
    return NextResponse.json(
      { success: false, error: "Archivo requerido" },
      { status: 400 }
    );
  }
  if (typeof password !== "string" || password.length === 0) {
    return NextResponse.json(
      { success: false, error: "Password requerido" },
      { status: 400 }
    );
  }
  if (file.size > MAX_PFX_SIZE) {
    return NextResponse.json(
      { success: false, error: "Archivo demasiado grande (max 200KB)" },
      { status: 400 }
    );
  }

  const pfxBuffer = Buffer.from(await file.arrayBuffer());

  let meta;
  try {
    meta = parsePfx(pfxBuffer, password);
  } catch (err) {
    if (err instanceof PfxParseError) {
      return NextResponse.json(
        { success: false, error: err.message },
        { status: 400 }
      );
    }
    throw err;
  }

  if (meta.notAfter < new Date()) {
    return NextResponse.json(
      {
        success: false,
        error: `El certificado venció el ${meta.notAfter.toISOString().split("T")[0]}.`,
      },
      { status: 400 }
    );
  }

  // Prisma `Bytes` expects `Uint8Array<ArrayBuffer>`; Node `Buffer` is now
  // typed `Buffer<ArrayBufferLike>` in Node 22, which TS rejects. Copy into a
  // fresh ArrayBuffer-backed Uint8Array to satisfy the genéricos sin perder
  // los bytes encriptados.
  const pfxBufRaw = encryptBuffer(pfxBuffer);
  const pfxDataEnc = new Uint8Array(pfxBufRaw);
  const passwordEnc = encryptString(password);

  const cert = await prisma.tenantDteCertificate.upsert({
    where: { tenantId: ctx.tenantId },
    create: {
      tenantId: ctx.tenantId,
      fileName: file.name,
      pfxDataEnc,
      passwordEnc,
      rutTitular: meta.rutTitular,
      nombreTitular: meta.nombreTitular,
      emisorCert: meta.emisorCert,
      notBefore: meta.notBefore,
      notAfter: meta.notAfter,
      fingerprint: meta.fingerprint,
      uploadedBy: ctx.userId,
    },
    update: {
      fileName: file.name,
      pfxDataEnc,
      passwordEnc,
      rutTitular: meta.rutTitular,
      nombreTitular: meta.nombreTitular,
      emisorCert: meta.emisorCert,
      notBefore: meta.notBefore,
      notAfter: meta.notAfter,
      fingerprint: meta.fingerprint,
      uploadedBy: ctx.userId,
      uploadedAt: new Date(),
    },
    select: {
      id: true,
      fileName: true,
      rutTitular: true,
      nombreTitular: true,
      emisorCert: true,
      notBefore: true,
      notAfter: true,
      fingerprint: true,
      uploadedAt: true,
    },
  });

  return NextResponse.json({ success: true, data: cert }, { status: 201 });
}

export async function DELETE() {
  const ctx = await requireAuth();
  if (!ctx) return unauthorized();
  const perms = await resolveApiPerms(ctx);
  if (!hasFacturacionCapability(perms, "facturacion_configure")) {
    return NextResponse.json(
      { success: false, error: "Sin permisos" },
      { status: 403 }
    );
  }

  const existing = await prisma.tenantDteCertificate.findUnique({
    where: { tenantId: ctx.tenantId },
  });
  if (!existing) {
    return NextResponse.json(
      { success: false, error: "No hay certificado para eliminar" },
      { status: 404 }
    );
  }

  await prisma.tenantDteCertificate.delete({
    where: { tenantId: ctx.tenantId },
  });

  return NextResponse.json({ success: true });
}
