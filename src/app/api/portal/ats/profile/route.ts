import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { parseBody } from "@/lib/api-auth";
import { getPortalSessionFromRequest } from "@/lib/ats/portal-auth";

const updateProfileSchema = z.object({
  guardiaId: z.string().uuid().optional(), // Legacy — prefer JWT session
  experienciaAnios: z.number().int().min(0).optional(),
  turnosDisponibles: z.array(z.string()).optional(),
  pretensionRentaMin: z.number().int().positive().optional(),
  pretensionRentaMax: z.number().int().positive().optional(),
  availableExtraShifts: z.boolean().optional(),
  os10: z.boolean().optional(),
  os10ExpiresAt: z.string().optional().nullable(),
  // Persona fields
  region: z.string().optional(),
  commune: z.string().optional(),
  phone: z.string().optional(),
  lat: z.number().optional(),
  lng: z.number().optional(),
});

async function resolveGuardiaId(req: NextRequest, bodyGuardiaId?: string): Promise<{ guardiaId: string } | NextResponse> {
  const session = await getPortalSessionFromRequest(req);
  if (session) {
    return { guardiaId: session.guardiaId };
  }
  // Legacy fallback
  const fallback = bodyGuardiaId || req.nextUrl.searchParams.get("guardiaId") || "";
  if (!fallback) {
    return NextResponse.json({ success: false, error: "No autenticado" }, { status: 401 });
  }
  console.warn("[ATS Portal] Legacy guardiaId auth — migrate to JWT");
  return { guardiaId: fallback };
}

export async function GET(request: NextRequest) {
  try {
    const result = await resolveGuardiaId(request);
    if (result instanceof NextResponse) return result;
    const { guardiaId } = result;

    const guardia = await prisma.opsGuardia.findUnique({
      where: { id: guardiaId },
      select: {
        id: true,
        tenantId: true,
        os10: true,
        os10ExpiresAt: true,
        experienciaAnios: true,
        turnosDisponibles: true,
        pretensionRentaMin: true,
        pretensionRentaMax: true,
        availableExtraShifts: true,
        atsProfileComplete: true,
        googleEmail: true,
        persona: {
          select: {
            firstName: true,
            lastName: true,
            rut: true,
            phone: true,
            region: true,
            commune: true,
            lat: true,
            lng: true,
            sex: true,
            hasMobilization: true,
          },
        },
      },
    });

    if (!guardia) {
      return NextResponse.json({ success: false, error: "Guardia no encontrado" }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: guardia });
  } catch (error) {
    console.error("[ATS] Error getting profile:", error);
    return NextResponse.json({ success: false, error: "Error al obtener perfil" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const parsed = await parseBody(request, updateProfileSchema);
    if (parsed.error) return parsed.error;
    const { guardiaId: bodyGuardiaId, region, commune, phone, lat, lng, os10ExpiresAt, ...guardiaFields } = parsed.data;

    const result = await resolveGuardiaId(request, bodyGuardiaId);
    if (result instanceof NextResponse) return result;
    const { guardiaId } = result;

    const guardia = await prisma.opsGuardia.findUnique({
      where: { id: guardiaId },
      select: { id: true, personaId: true },
    });
    if (!guardia) {
      return NextResponse.json({ success: false, error: "Guardia no encontrado" }, { status: 404 });
    }

    await prisma.$transaction(async (tx) => {
      // Update guardia fields
      const guardiaData: Record<string, unknown> = { ...guardiaFields };
      if (os10ExpiresAt !== undefined) {
        guardiaData.os10ExpiresAt = os10ExpiresAt ? new Date(os10ExpiresAt) : null;
      }
      guardiaData.atsProfileComplete = true;

      await tx.opsGuardia.update({
        where: { id: guardiaId },
        data: guardiaData,
      });

      // Update persona fields
      const personaData: Record<string, unknown> = {};
      if (region !== undefined) personaData.region = region;
      if (commune !== undefined) personaData.commune = commune;
      if (phone !== undefined) personaData.phone = phone;
      if (lat !== undefined) personaData.lat = lat;
      if (lng !== undefined) personaData.lng = lng;

      if (Object.keys(personaData).length > 0) {
        await tx.opsPersona.update({
          where: { id: guardia.personaId },
          data: personaData,
        });
      }
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[ATS] Error updating profile:", error);
    return NextResponse.json({ success: false, error: "Error al actualizar perfil" }, { status: 500 });
  }
}
