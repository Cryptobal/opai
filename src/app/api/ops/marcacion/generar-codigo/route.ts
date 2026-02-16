/**
 * POST /api/ops/marcacion/generar-codigo
 * Genera o regenera el código de marcación de una instalación.
 * Ruta protegida (requiere auth).
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api-auth";
import { generateMarcacionCode } from "@/lib/marcacion";
import { z } from "zod";

const schema = z.object({
  installationId: z.string().uuid(),
});

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuth();
    if (!auth) {
      return NextResponse.json(
        { success: false, error: "No autorizado" },
        { status: 401 }
      );
    }

    const body = await req.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: "Datos inválidos" },
        { status: 400 }
      );
    }

    const { installationId } = parsed.data;

    // Verificar que la instalación existe y pertenece al tenant
    const installation = await prisma.crmInstallation.findFirst({
      where: {
        id: installationId,
        tenantId: auth.tenantId,
      },
      select: { id: true, name: true, marcacionCode: true },
    });

    if (!installation) {
      return NextResponse.json(
        { success: false, error: "Instalación no encontrada" },
        { status: 404 }
      );
    }

    // Generar código único (intentar hasta 5 veces para evitar colisiones)
    let code = "";
    let attempts = 0;
    while (attempts < 5) {
      code = generateMarcacionCode();
      const existing = await prisma.crmInstallation.findFirst({
        where: { marcacionCode: code },
        select: { id: true },
      });
      if (!existing) break;
      attempts++;
    }

    if (!code) {
      return NextResponse.json(
        { success: false, error: "Error generando código único" },
        { status: 500 }
      );
    }

    // Actualizar la instalación con el nuevo código
    await prisma.crmInstallation.update({
      where: { id: installationId },
      data: { marcacionCode: code },
    });

    // Construir la URL de marcación
    const baseUrl = process.env.NEXTAUTH_URL || process.env.VERCEL_URL || "https://opai.gard.cl";
    const marcacionUrl = `${baseUrl}/marcar/${code}`;

    return NextResponse.json({
      success: true,
      data: {
        installationId: installation.id,
        installationName: installation.name,
        marcacionCode: code,
        marcacionUrl,
        previousCode: installation.marcacionCode,
        message: installation.marcacionCode
          ? "Código regenerado. El código anterior ya no es válido."
          : "Código generado exitosamente.",
      },
    });
  } catch (error) {
    console.error("[ops/marcacion/generar-codigo] Error:", error);
    return NextResponse.json(
      { success: false, error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}
