import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePortalGuardiaAuth } from "@/lib/portal-guardia-auth";
import { logAudit } from "@/lib/audit";
import { decryptPersonaFields } from "@/lib/persona-encryption";

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
