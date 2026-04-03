import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getGamificacionConfig, registrarEvento } from "@/lib/gamification";
import { requirePortalGuardiaAuth } from "@/lib/portal-guardia-auth";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { guardiaId, receptorId, categoria, mensaje } = body;

    const guardAuth = await requirePortalGuardiaAuth(guardiaId);
    if (!guardAuth) {
      return NextResponse.json(
        { success: false, error: "Guardia no encontrado o inactivo" },
        { status: 401 },
      );
    }

    if (!receptorId) {
      return NextResponse.json(
        { success: false, error: "receptorId es requerido" },
        { status: 400 },
      );
    }

    if (!categoria) {
      return NextResponse.json(
        { success: false, error: "categoria es requerida" },
        { status: 400 },
      );
    }

    const VALID_CATEGORIES = ["companerismo", "puntualidad", "profesionalismo", "liderazgo", "iniciativa"];
    if (!VALID_CATEGORIES.includes(categoria)) {
      return NextResponse.json(
        { success: false, error: `Categoría inválida. Debe ser una de: ${VALID_CATEGORIES.join(", ")}` },
        { status: 400 },
      );
    }

    // Cannot recognize yourself
    if (guardAuth.guardiaId === receptorId) {
      return NextResponse.json(
        { success: false, error: "No puedes reconocerte a ti mismo" },
        { status: 400 },
      );
    }

    // Get the sender guard's current installation
    const dador = await prisma.opsGuardia.findUnique({
      where: { id: guardAuth.guardiaId },
      select: { currentInstallationId: true },
    });

    // Verify the receiver exists and is in the same tenant
    const receptor = await prisma.opsGuardia.findUnique({
      where: { id: receptorId },
      select: { id: true, tenantId: true },
    });

    if (!receptor || receptor.tenantId !== guardAuth.tenantId) {
      return NextResponse.json(
        { success: false, error: "Guardia receptor no encontrado" },
        { status: 404 },
      );
    }

    // Check max 3 recognitions per day by the sender
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    const manana = new Date(hoy);
    manana.setDate(manana.getDate() + 1);

    const reconocimientosHoy = await prisma.gamificacionReconocimiento.count({
      where: {
        dadorId: guardAuth.guardiaId,
        createdAt: { gte: hoy, lt: manana },
      },
    });

    if (reconocimientosHoy >= 3) {
      return NextResponse.json(
        { success: false, error: "Ya has enviado el máximo de 3 reconocimientos hoy" },
        { status: 429 },
      );
    }

    // Check not same receiver in 24h
    const hace24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const reconocimientoReciente = await prisma.gamificacionReconocimiento.findFirst({
      where: {
        dadorId: guardAuth.guardiaId,
        receptorId,
        createdAt: { gte: hace24h },
      },
    });

    if (reconocimientoReciente) {
      return NextResponse.json(
        { success: false, error: "Ya reconociste a esta persona en las últimas 24 horas" },
        { status: 429 },
      );
    }

    // Get gamification config
    const config = await getGamificacionConfig(guardAuth.tenantId);
    if (!config) {
      return NextResponse.json(
        { success: false, error: "Gamificación no configurada" },
        { status: 404 },
      );
    }

    // Create the recognition
    const reconocimiento = await prisma.gamificacionReconocimiento.create({
      data: {
        tenantId: guardAuth.tenantId,
        dadorId: guardAuth.guardiaId,
        receptorId,
        installationId: dador?.currentInstallationId,
        categoria,
        mensaje: mensaje ?? null,
      },
    });

    // Register gamification events for both parties
    await Promise.all([
      registrarEvento(
        {
          guardiaId: receptorId,
          tenantId: guardAuth.tenantId,
          installationId: dador?.currentInstallationId,
          tipo: "reconocimiento_recibido",
          dimension: "social",
          descripcion: `Reconocimiento recibido: ${categoria}`,
          referenciaModelo: "GamificacionReconocimiento",
          referenciaId: reconocimiento.id,
        },
        config,
      ),
      registrarEvento(
        {
          guardiaId: guardAuth.guardiaId,
          tenantId: guardAuth.tenantId,
          installationId: dador?.currentInstallationId,
          tipo: "reconocimiento_dado",
          dimension: "social",
          descripcion: `Reconocimiento enviado: ${categoria}`,
          referenciaModelo: "GamificacionReconocimiento",
          referenciaId: reconocimiento.id,
        },
        config,
      ),
    ]);

    return NextResponse.json({
      success: true,
      data: { id: reconocimiento.id },
    });
  } catch (error) {
    console.error("[Portal Guardia] Gamification reconocimiento error:", error);
    return NextResponse.json(
      { success: false, error: "Error al enviar reconocimiento" },
      { status: 500 },
    );
  }
}
