/**
 * POST /api/crm/signatures/logo — upload de logo de firma a R2.
 * PNG / JPEG / WebP, máx 1 MB. SVG rechazado.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireCorreosAccess } from "@/lib/api-auth-productividad";
import { uploadFile } from "@/lib/storage";

const MAX_SIZE = 1 * 1024 * 1024; // 1 MB
const ALLOWED_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

export async function POST(request: NextRequest) {
  try {
    const mod = await requireCorreosAccess("edit");
    if (!mod.authorized) return mod.response;
    const { ctx } = mod;

    const r2Public = (process.env.R2_PUBLIC_URL ?? "").trim();
    if (!r2Public) {
      return NextResponse.json(
        {
          success: false,
          error:
            "R2_PUBLIC_URL no está configurado. No se puede subir el logo de firma.",
        },
        { status: 500 },
      );
    }

    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json(
        { success: false, error: "No se proporcionó archivo" },
        { status: 400 },
      );
    }

    if (file.type === "image/svg+xml" || /\.svg$/i.test(file.name)) {
      return NextResponse.json(
        {
          success: false,
          error: "SVG no permitido en firmas de correo (riesgo XSS y sin soporte en clientes).",
        },
        { status: 400 },
      );
    }

    if (!ALLOWED_TYPES.has(file.type)) {
      return NextResponse.json(
        { success: false, error: "Tipo no permitido. Use PNG, JPEG o WebP (máx. 1 MB)." },
        { status: 400 },
      );
    }

    if (file.size > MAX_SIZE) {
      return NextResponse.json(
        { success: false, error: "El archivo excede el límite de 1 MB" },
        { status: 400 },
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const result = await uploadFile(
      buffer,
      file.name,
      file.type,
      "signatures",
      ctx.tenantId,
    );

    if (!result.publicUrl?.trim()) {
      return NextResponse.json(
        {
          success: false,
          error:
            "La URL pública del logo quedó vacía. Verifica R2_PUBLIC_URL en el entorno.",
        },
        { status: 500 },
      );
    }

    return NextResponse.json({
      success: true,
      data: { url: result.publicUrl, storageKey: result.storageKey },
    });
  } catch (error) {
    console.error("[SIGNATURES_LOGO] Error:", error);
    return NextResponse.json(
      { success: false, error: "Error al subir el logo" },
      { status: 500 },
    );
  }
}
