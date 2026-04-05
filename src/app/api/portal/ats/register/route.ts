import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { parseBody } from "@/lib/api-auth";
import { asignarPin } from "@/lib/ats/pin.service";
import { createAtsToken } from "@/lib/ats/token.service";
import { setPortalCookie } from "@/lib/ats/portal-auth";

const registerSchema = z.object({
  googleAuthId: z.string().min(1),
  googleEmail: z.string().email(),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  phone: z.string().optional(),
  rut: z.string().optional(),
  tenantId: z.string().optional(),
});

export async function POST(request: NextRequest) {
  try {
    const parsed = await parseBody(request, registerSchema);
    if (parsed.error) return parsed.error;
    const body = parsed.data;

    // 1. Verificar si ya existe guardia con este googleAuthId
    const existingGuardia = await prisma.opsGuardia.findUnique({
      where: { googleAuthId: body.googleAuthId },
      select: {
        id: true,
        personaId: true,
        tenantId: true,
        marcacionPinVisible: true,
        persona: { select: { firstName: true, lastName: true, rut: true } },
      },
    });

    if (existingGuardia) {
      const token = await createAtsToken({
        guardiaId: existingGuardia.id,
        tenantId: existingGuardia.tenantId,
        personaId: existingGuardia.personaId,
      });

      const response = NextResponse.json({
        success: true,
        data: {
          guardiaId: existingGuardia.id,
          personaId: existingGuardia.personaId,
          tenantId: existingGuardia.tenantId,
          isNew: false,
          token,
        },
      });
      response.cookies.set(setPortalCookie(token));
      return response;
    }

    // 2. Si tiene RUT, buscar si ya existe persona
    let personaId: string | null = null;
    let existingGuardiaByRut = null;

    if (body.rut) {
      const persona = await prisma.opsPersona.findFirst({
        where: { rut: body.rut },
        select: { id: true },
      });
      if (persona) {
        personaId = persona.id;
        // Verificar si tiene guardia asociado
        existingGuardiaByRut = await prisma.opsGuardia.findFirst({
          where: { personaId: persona.id },
          select: { id: true, tenantId: true, personaId: true },
        });
      }
    }

    const targetTenantId = body.tenantId || process.env.OPAI_POOL_TENANT_ID;
    if (!targetTenantId) {
      return NextResponse.json(
        { success: false, error: "No se puede determinar el tenant. Configure OPAI_POOL_TENANT_ID." },
        { status: 500 },
      );
    }

    // 3. Si ya existe guardia con ese RUT, asociar Google Auth
    if (existingGuardiaByRut) {
      await prisma.opsGuardia.update({
        where: { id: existingGuardiaByRut.id },
        data: {
          googleAuthId: body.googleAuthId,
          googleEmail: body.googleEmail,
          atsRegisteredAt: new Date(),
        },
      });
      const pin = await asignarPin(existingGuardiaByRut.id);

      const token = await createAtsToken({
        guardiaId: existingGuardiaByRut.id,
        tenantId: existingGuardiaByRut.tenantId,
        personaId: existingGuardiaByRut.personaId,
      });

      const response = NextResponse.json({
        success: true,
        data: {
          guardiaId: existingGuardiaByRut.id,
          personaId: existingGuardiaByRut.personaId,
          tenantId: existingGuardiaByRut.tenantId,
          pin,
          isNew: false,
          token,
        },
      });
      response.cookies.set(setPortalCookie(token));
      return response;
    }

    // 4. Crear persona + guardia
    const result = await prisma.$transaction(async (tx) => {
      let pId = personaId;

      if (!pId) {
        const persona = await tx.opsPersona.create({
          data: {
            tenantId: targetTenantId,
            firstName: body.firstName,
            lastName: body.lastName,
            rut: body.rut || null,
            phone: body.phone || null,
          },
        });
        pId = persona.id;
      }

      const guardia = await tx.opsGuardia.create({
        data: {
          tenantId: targetTenantId,
          personaId: pId,
          lifecycleStatus: "postulante",
          status: "active",
          googleAuthId: body.googleAuthId,
          googleEmail: body.googleEmail,
          personalEmail: body.googleEmail,
          atsRegisteredAt: new Date(),
          availableExtraShifts: false,
        },
      });

      return { guardiaId: guardia.id, personaId: pId };
    });

    const pin = await asignarPin(result.guardiaId);

    const token = await createAtsToken({
      guardiaId: result.guardiaId,
      tenantId: targetTenantId,
      personaId: result.personaId,
    });

    const response = NextResponse.json({
      success: true,
      data: {
        guardiaId: result.guardiaId,
        personaId: result.personaId,
        tenantId: targetTenantId,
        pin,
        isNew: true,
        token,
      },
    }, { status: 201 });
    response.cookies.set(setPortalCookie(token));
    return response;
  } catch (error) {
    console.error("[ATS] Error registering guard:", error);
    return NextResponse.json({ success: false, error: "Error en el registro" }, { status: 500 });
  }
}
