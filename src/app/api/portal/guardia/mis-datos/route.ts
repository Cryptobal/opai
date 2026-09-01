import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePortalGuardiaAuth } from "@/lib/portal-guardia-auth";
import { logAudit } from "@/lib/audit";
import { decryptPersonaFields } from "@/lib/persona-encryption";
import {
  isPersonalEmailTaken,
  PERSONAL_EMAIL_TAKEN_ERROR,
} from "@/lib/marcacion-personal-email";
import {
  isValidPersonalEmail,
  normalizePersonalEmail,
} from "@/lib/marcacion-format";
import { sendCambioCorreoPersonal } from "@/lib/marcacion-email";
import * as bcrypt from "bcryptjs";
import { z } from "zod";

/**
 * GET /api/portal/guardia/mis-datos?guardiaId=xxx
 * Derecho de ACCESO (Art. 5 Ley 21.719).
 */
export async function GET(request: NextRequest) {
  try {
    const guardiaId = new URL(request.url).searchParams.get("guardiaId");
    const guardAuth = await requirePortalGuardiaAuth(guardiaId);
    if (!guardAuth) {
      return NextResponse.json({ success: false, error: "No autorizado" }, { status: 401 });
    }

    const guardia = await prisma.opsGuardia.findUnique({
      where: { id: guardAuth.guardiaId, tenantId: guardAuth.tenantId },
      include: {
        persona: true,
        currentInstallation: { select: { id: true, name: true } },
      },
    });

    if (!guardia) {
      return NextResponse.json({ success: false, error: "No encontrado" }, { status: 404 });
    }

    // Contacto del DPO del tenant (Ley 21.719). Fallback a datos@opai.cl
    // si el tenant todavía no lo configuró.
    const tenant = await prisma.tenant.findUnique({
      where: { id: guardAuth.tenantId },
      select: { dpoContactEmail: true },
    });
    const contactoDerechos = tenant?.dpoContactEmail?.trim() || "datos@opai.cl";

    // Descifrar campos sensibles (Ley 21.719)
    const persona = decryptPersonaFields(guardia.persona);

    const datosPersonales = {
      nombre: `${persona.firstName} ${persona.lastName}`,
      rut: persona.rut,
      fechaNacimiento: persona.birthDate,
      sexo: persona.sex,
      nacionalidad: persona.nacionalidad,

      email: persona.email,
      emailPersonal: persona.personalEmail,
      telefono: persona.phone,
      telefonoMovil: persona.phoneMobile,

      direccion: persona.addressFormatted,
      comuna: persona.commune,
      ciudad: persona.city,
      region: persona.region,

      codigoGuardia: guardia.code,
      estado: guardia.status,
      estadoCicloVida: guardia.lifecycleStatus,
      fechaContratacion: guardia.hiredAt,
      tipoContrato: guardia.contractType,
      instalacionActual: guardia.currentInstallation?.name ?? null,

      afp: persona.afp,
      sistemaSalud: persona.healthSystem,
      isapre: persona.isapreName,

      faceIdRegistrado: guardia.faceIdRegistered,
      faceIdConsentimiento: guardia.faceIdConsentAt,
      faceIdConsentimientoRevocado: guardia.faceIdConsentRevoked,

      tallaCamisa: persona.shirtSize,
      tallaPantalon: persona.pantsSize,
      tallaPolera: persona.tshirtSize,
      tallaZapato: persona.shoeSize,

      fechaCreacion: persona.createdAt,
      ultimaActualizacion: persona.updatedAt,
    };

    await logAudit({
      userId: guardAuth.guardiaId,
      action: "DATA_ACCESS",
      entity: "OpsPersona",
      entityId: persona.id,
      details: { type: "ARCO_ACCESS", portal: "guardia" },
      tenantId: guardAuth.tenantId,
      request,
    });

    return NextResponse.json({
      success: true,
      data: datosPersonales,
      infoTratamiento: {
        responsable: "La empresa de seguridad donde trabajas (tu empleador)",
        encargado: "Opai SpA (plataforma tecnológica)",
        finalidad:
          "Gestión de la relación laboral, control de asistencia, pago de remuneraciones, cumplimiento normativo",
        baseLegal: "Ejecución del contrato de trabajo y obligaciones legales laborales",
        plazoConservacion:
          "Durante toda la relación laboral y 5 años adicionales después de su término (normativa laboral chilena). Los registros de auditoría se conservan 6 años conforme al Art. 15 de la Ley 21.719. Los respaldos tienen rotación de 30 días.",
        contactoDerechos,
      },
    });
  } catch (error) {
    console.error("[Portal Guardia] Mis datos error:", error);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}

const patchSchema = z.object({
  personalEmail: z.string().min(3),
  currentPin: z.string().min(4).max(6),
});

/**
 * PATCH /api/portal/guardia/mis-datos
 * Autoservicio de correo personal (Art. 7 f / 12 e).
 */
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: "Correo y PIN actual son requeridos" },
        { status: 400 },
      );
    }

    const urlId = new URL(request.url).searchParams.get("guardiaId");
    const guardiaId = (body as { guardiaId?: string }).guardiaId ?? urlId;
    const auth = await requirePortalGuardiaAuth(guardiaId);
    if (!auth) {
      return NextResponse.json({ success: false, error: "No autorizado" }, { status: 401 });
    }

    const email = normalizePersonalEmail(parsed.data.personalEmail);
    if (!isValidPersonalEmail(email)) {
      return NextResponse.json(
        { success: false, error: "Formato de correo inválido" },
        { status: 400 },
      );
    }

    const guardia = await prisma.opsGuardia.findFirst({
      where: { id: auth.guardiaId, tenantId: auth.tenantId },
      select: {
        id: true,
        marcacionPin: true,
        personalEmail: true,
        personaId: true,
        persona: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            personalEmail: true,
          },
        },
      },
    });
    if (!guardia?.marcacionPin) {
      return NextResponse.json({ success: false, error: "PIN no configurado" }, { status: 400 });
    }

    const pinOk = await bcrypt.compare(parsed.data.currentPin, guardia.marcacionPin);
    if (!pinOk) {
      return NextResponse.json({ success: false, error: "PIN actual incorrecto" }, { status: 400 });
    }

    const taken = await isPersonalEmailTaken({
      tenantId: auth.tenantId,
      email,
      excludeGuardiaId: guardia.id,
      excludePersonaId: guardia.persona.id,
    });
    if (taken) {
      return NextResponse.json(
        { success: false, error: PERSONAL_EMAIL_TAKEN_ERROR },
        { status: 409 },
      );
    }

    const previous =
      guardia.personalEmail?.trim() || guardia.persona.personalEmail?.trim() || null;
    if (previous && normalizePersonalEmail(previous) === email) {
      return NextResponse.json({ success: true, data: { personalEmail: email } });
    }

    await prisma.$transaction([
      prisma.opsGuardia.update({
        where: { id: guardia.id },
        data: { personalEmail: email },
      }),
      prisma.opsPersona.update({
        where: { id: guardia.persona.id },
        data: { personalEmail: email },
      }),
    ]);

    const now = new Date();
    const name = `${guardia.persona.firstName} ${guardia.persona.lastName}`.trim();
    await logAudit({
      userId: auth.guardiaId,
      action: "UPDATE",
      entity: "OpsPersona",
      entityId: guardia.persona.id,
      details: { type: "PERSONAL_EMAIL_SELF_SERVICE", before: previous, after: email },
      tenantId: auth.tenantId,
      request,
    });

    sendCambioCorreoPersonal({
      to: email,
      guardiaName: name,
      previousEmail: previous,
      newEmail: email,
      when: now,
      kind: "confirmacion_nuevo",
    }).catch((err) => console.error("[portal-guardia/mis-datos] mail nuevo:", err));

    if (previous && normalizePersonalEmail(previous) !== email) {
      sendCambioCorreoPersonal({
        to: previous,
        guardiaName: name,
        previousEmail: previous,
        newEmail: email,
        when: now,
        kind: "aviso_anterior",
      }).catch((err) => console.error("[portal-guardia/mis-datos] mail anterior:", err));
    }

    return NextResponse.json({ success: true, data: { personalEmail: email } });
  } catch (error) {
    console.error("[Portal Guardia] PATCH mis-datos:", error);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}

