import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { parseBody } from "@/lib/api-auth";
import { verificarPin } from "@/lib/ats/pin.service";
import { createAtsToken } from "@/lib/ats/token.service";
import { setPortalCookie } from "@/lib/ats/portal-auth";

const authSchema = z.discriminatedUnion("method", [
  z.object({
    method: z.literal("google"),
    googleAuthId: z.string().min(1),
  }),
  z.object({
    method: z.literal("pin"),
    rut: z.string().min(1),
    pin: z.string().min(4),
  }),
]);

export async function POST(request: NextRequest) {
  try {
    const parsed = await parseBody(request, authSchema);
    if (parsed.error) return parsed.error;
    const body = parsed.data;

    if (body.method === "google") {
      const guardia = await prisma.opsGuardia.findUnique({
        where: { googleAuthId: body.googleAuthId },
        select: {
          id: true,
          tenantId: true,
          personaId: true,
          atsProfileComplete: true,
          lifecycleStatus: true,
          persona: { select: { firstName: true, lastName: true, rut: true } },
        },
      });

      if (!guardia) {
        return NextResponse.json({ success: false, error: "Cuenta no encontrada. Regístrate primero." }, { status: 404 });
      }

      const token = await createAtsToken({
        guardiaId: guardia.id,
        tenantId: guardia.tenantId,
        personaId: guardia.personaId,
      });

      const response = NextResponse.json({
        success: true,
        data: {
          guardiaId: guardia.id,
          tenantId: guardia.tenantId,
          personaId: guardia.personaId,
          profileComplete: guardia.atsProfileComplete,
          firstName: guardia.persona.firstName,
          lastName: guardia.persona.lastName,
          token,
        },
      });
      response.cookies.set(setPortalCookie(token));
      return response;
    }

    // method === "pin"
    const persona = await prisma.opsPersona.findFirst({
      where: { rut: body.rut },
      select: { id: true },
    });
    if (!persona) {
      return NextResponse.json({ success: false, error: "RUT no encontrado" }, { status: 404 });
    }

    const guardia = await prisma.opsGuardia.findUnique({
      where: { personaId: persona.id },
      select: {
        id: true,
        tenantId: true,
        personaId: true,
        atsProfileComplete: true,
        lifecycleStatus: true,
        persona: { select: { firstName: true, lastName: true, rut: true } },
      },
    });
    if (!guardia) {
      return NextResponse.json({ success: false, error: "Cuenta no encontrada" }, { status: 404 });
    }

    const pinValid = await verificarPin(guardia.id, body.pin);
    if (!pinValid) {
      return NextResponse.json({ success: false, error: "PIN incorrecto" }, { status: 401 });
    }

    const token = await createAtsToken({
      guardiaId: guardia.id,
      tenantId: guardia.tenantId,
      personaId: guardia.personaId,
    });

    const response = NextResponse.json({
      success: true,
      data: {
        guardiaId: guardia.id,
        tenantId: guardia.tenantId,
        personaId: guardia.personaId,
        profileComplete: guardia.atsProfileComplete,
        firstName: guardia.persona.firstName,
        lastName: guardia.persona.lastName,
        token,
      },
    });
    response.cookies.set(setPortalCookie(token));
    return response;
  } catch (error) {
    console.error("[ATS] Error authenticating guard:", error);
    return NextResponse.json({ success: false, error: "Error de autenticación" }, { status: 500 });
  }
}
