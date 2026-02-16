import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const guardiaId = searchParams.get("guardiaId");

    if (!guardiaId) {
      return NextResponse.json(
        { success: false, error: "guardiaId es requerido" },
        { status: 400 },
      );
    }

    const guardia = await prisma.opsGuardia.findUnique({
      where: { id: guardiaId },
      include: {
        persona: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            rut: true,
            email: true,
            phone: true,
            phoneMobile: true,
            addressFormatted: true,
            birthDate: true,
          },
        },
        currentInstallation: {
          select: { id: true, name: true },
        },
      },
    });

    if (!guardia) {
      return NextResponse.json(
        { success: false, error: "Guardia no encontrado" },
        { status: 404 },
      );
    }

    const data = {
      id: guardia.id,
      firstName: guardia.persona.firstName,
      lastName: guardia.persona.lastName,
      rut: guardia.persona.rut,
      email: guardia.persona.email,
      phone: guardia.persona.phone ?? guardia.persona.phoneMobile,
      code: guardia.code,
      status: guardia.status,
      lifecycleStatus: guardia.lifecycleStatus,
      currentInstallationId: guardia.currentInstallationId,
      currentInstallation: guardia.currentInstallation?.name ?? null,
      hiredAt: guardia.hiredAt instanceof Date ? guardia.hiredAt.toISOString() : guardia.hiredAt,
      addressFormatted: guardia.persona.addressFormatted,
      birthDate: guardia.persona.birthDate instanceof Date
        ? guardia.persona.birthDate.toISOString().split("T")[0]
        : guardia.persona.birthDate,
    };

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("[Portal Guardia] Profile error:", error);
    return NextResponse.json(
      { success: false, error: "Error al obtener perfil" },
      { status: 500 },
    );
  }
}
