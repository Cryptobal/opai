import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePortalGuardiaAuth } from "@/lib/portal-guardia-auth";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const guardiaId = searchParams.get("guardiaId");
    const guardAuth = await requirePortalGuardiaAuth(guardiaId);
    if (!guardAuth) {
      return NextResponse.json(
        { success: false, error: "Guardia no encontrado o inactivo" },
        { status: 401 },
      );
    }

    const guardia = await prisma.opsGuardia.findUnique({
      where: { id: guardAuth.guardiaId, tenantId: guardAuth.tenantId },
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

    const profile = {
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
      installationName: guardia.currentInstallation?.name ?? null,
      hireDate: guardia.hiredAt instanceof Date ? guardia.hiredAt.toISOString() : guardia.hiredAt,
      addressFormatted: guardia.persona.addressFormatted,
      birthDate: guardia.persona.birthDate instanceof Date
        ? guardia.persona.birthDate.toISOString().split("T")[0]
        : guardia.persona.birthDate,
      faceIdPhotoUrl: guardia.faceIdPhotoUrl ?? null,
      faceIdRegistered: guardia.faceIdRegistered,
    };

    return NextResponse.json({ success: true, data: profile, profile });
  } catch (error) {
    console.error("[Portal Guardia] Profile error:", error);
    return NextResponse.json(
      { success: false, error: "Error al obtener perfil" },
      { status: 500 },
    );
  }
}
