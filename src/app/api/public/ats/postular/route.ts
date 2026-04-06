import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import {
  CHILE_BANKS,
  isChileanRutFormat,
  isValidChileanRut,
  isValidMobileNineDigits,
  lifecycleToLegacyStatus,
  normalizeMobileNineDigits,
  normalizeRut,
} from "@/lib/personas";
import { getPublicFormConfig } from "@/lib/ats/public-form-config";

/* ------------------------------------------------------------------ */
/*  Schema — lightweight ATS application (no auth required)           */
/* ------------------------------------------------------------------ */

const atsDocumentoSchema = z.object({
  code: z.string().min(1),
  fileUrl: z.string().url(),
  fileName: z.string().min(1),
  mimeType: z.string().min(1),
});

const atsTallasSchema = z
  .object({
    calzado: z.string().trim().max(20).optional().nullable(),
    pantalon: z.string().trim().max(20).optional().nullable(),
    polera: z.string().trim().max(20).optional().nullable(),
    camisa: z.string().trim().max(20).optional().nullable(),
    polar: z.string().trim().max(20).optional().nullable(),
    chaqueta: z.string().trim().max(20).optional().nullable(),
  })
  .optional()
  .nullable();

const atsPostulacionSchema = z.object({
  jobPostingId: z.string().uuid("ID de oferta inválido"),
  firstName: z.string().trim().min(1, "Nombre es requerido").max(100),
  lastName: z.string().trim().min(1, "Apellido es requerido").max(100),
  rut: z
    .string()
    .trim()
    .refine((v) => isChileanRutFormat(v), "RUT debe ir sin puntos y con guión (ej: 12345678-9)")
    .refine((v) => isValidChileanRut(v), "RUT chileno inválido")
    .transform((v) => normalizeRut(v)),
  email: z.string().trim().email("Email inválido").max(200),
  phoneMobile: z
    .string()
    .trim()
    .refine((v) => isValidMobileNineDigits(v), "Celular debe tener 9 dígitos (ej: 912345678)")
    .transform((v) => normalizeMobileNineDigits(v)),
  tieneOS10: z.boolean().default(false),
  experienciaAnios: z.number().int().min(0).max(50).default(0),
  tieneMovilizacion: z.boolean().default(false),
  notas: z.string().trim().max(1000).optional().nullable(),

  // ── Extended optional persona fields ──
  birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  sex: z.string().trim().max(10).optional().nullable(),
  addressFormatted: z.string().trim().max(300).optional().nullable(),
  googlePlaceId: z.string().trim().max(200).optional().nullable(),
  commune: z.string().trim().max(120).optional().nullable(),
  city: z.string().trim().max(120).optional().nullable(),
  region: z.string().trim().max(120).optional().nullable(),
  afp: z.string().trim().max(80).optional().nullable(),
  healthSystem: z.string().trim().max(80).optional().nullable(),
  bankCode: z.string().trim().max(50).optional().nullable(),
  bankAccountType: z.string().trim().max(50).optional().nullable(),
  bankAccountNumber: z.string().trim().max(100).optional().nullable(),
  tallas: atsTallasSchema,
  heightCm: z.number().min(120).max(230).optional().nullable(),
  weightKg: z.number().min(35).max(250).optional().nullable(),
  documentos: z.array(atsDocumentoSchema).optional().default([]),
});

type AtsPostulacionBody = z.infer<typeof atsPostulacionSchema>;

/** Build the persona create/update payload for the optional extended fields. */
function buildPersonaExtendedData(body: AtsPostulacionBody) {
  return {
    ...(body.birthDate ? { birthDate: new Date(`${body.birthDate}T00:00:00.000Z`) } : {}),
    ...(body.sex ? { sex: body.sex } : {}),
    ...(body.addressFormatted ? { addressFormatted: body.addressFormatted } : {}),
    ...(body.googlePlaceId ? { googlePlaceId: body.googlePlaceId } : {}),
    ...(body.commune ? { commune: body.commune } : {}),
    ...(body.city ? { city: body.city } : {}),
    ...(body.region ? { region: body.region } : {}),
    ...(body.afp ? { afp: body.afp } : {}),
    ...(body.healthSystem ? { healthSystem: body.healthSystem } : {}),
    ...(body.tallas?.calzado ? { shoeSize: body.tallas.calzado } : {}),
    ...(body.tallas?.pantalon ? { pantsSize: body.tallas.pantalon } : {}),
    ...(body.tallas?.polera ? { tshirtSize: body.tallas.polera } : {}),
    ...(body.tallas?.camisa ? { shirtSize: body.tallas.camisa } : {}),
    ...(body.tallas?.polar ? { polarSize: body.tallas.polar } : {}),
    ...(body.tallas?.chaqueta ? { jacketSize: body.tallas.chaqueta } : {}),
    ...(body.heightCm != null ? { heightCm: new Prisma.Decimal(body.heightCm) } : {}),
    ...(body.weightKg != null ? { weightKg: new Prisma.Decimal(body.weightKg) } : {}),
  };
}

/* ------------------------------------------------------------------ */
/*  Code generator (same logic as full postulacion)                   */
/* ------------------------------------------------------------------ */

function buildNextGuardiaCode(lastCode?: string | null): string {
  if (!lastCode) return "G-000001";
  const match = /^G-(\d{6})$/.exec(lastCode);
  const next = (match ? Number(match[1]) : 0) + 1;
  return `G-${String(next).padStart(6, "0")}`;
}

async function generateUniqueGuardiaCode(
  tx: Prisma.TransactionClient,
  tenantId: string,
): Promise<string> {
  const rows = await tx.$queryRaw<Array<{ code: string | null }>>`
    SELECT code
    FROM ops.guardias
    WHERE tenant_id = ${tenantId}
      AND code ~ '^G-[0-9]{6}$'
    ORDER BY code DESC
    LIMIT 1
  `;
  return buildNextGuardiaCode(rows[0]?.code ?? null);
}

/* ------------------------------------------------------------------ */
/*  POST /api/public/ats/postular                                     */
/* ------------------------------------------------------------------ */

export async function POST(request: NextRequest) {
  try {
    const raw = await request.json();
    const parsed = atsPostulacionSchema.safeParse(raw);
    if (!parsed.success) {
      const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
      return NextResponse.json({ success: false, error: issues }, { status: 400 });
    }

    const body = parsed.data;

    // Verify job exists and is active
    const job = await prisma.atsJobPosting.findUnique({
      where: { id: body.jobPostingId },
      select: {
        id: true,
        tenantId: true,
        estado: true,
        titulo: true,
        requiereOS10: true,
        requiereMovilizacion: true,
        turno: true,
        rentaMin: true,
        rentaMax: true,
        experienciaMinAnios: true,
        genero: true,
      },
    });
    if (!job || job.estado !== "ACTIVO") {
      return NextResponse.json({ success: false, error: "Oferta no disponible" }, { status: 404 });
    }

    const tenantId = job.tenantId;

    // Validate required documents from tenant config
    const formCfg = await getPublicFormConfig(body.jobPostingId);
    if (formCfg) {
      const requiredDocs = formCfg.documents.filter((d) => d.required).map((d) => d.code);
      const providedDocs = new Set((body.documentos ?? []).map((d) => d.code));
      const missing = requiredDocs.filter((c) => !providedDocs.has(c));
      if (missing.length > 0) {
        return NextResponse.json(
          { success: false, error: `Faltan documentos obligatorios: ${missing.join(", ")}` },
          { status: 400 },
        );
      }
    }

    // Check if persona with this RUT already exists in this tenant
    const existingPersona = await prisma.opsPersona.findFirst({
      where: { tenantId, rut: body.rut },
      select: {
        id: true,
        guardia: { select: { id: true, lifecycleStatus: true, isBlacklisted: true } },
      },
    });

    let guardiaId: string;

    if (existingPersona?.guardia) {
      // Guard already exists for this tenant
      if (existingPersona.guardia.isBlacklisted) {
        return NextResponse.json(
          { success: false, error: "No es posible postular. Contacta a recursos humanos." },
          { status: 403 },
        );
      }

      guardiaId = existingPersona.guardia.id;

      // Check if already applied to this job
      const existingApp = await prisma.atsApplication.findUnique({
        where: {
          jobPostingId_guardiaId: {
            jobPostingId: body.jobPostingId,
            guardiaId,
          },
        },
      });
      if (existingApp) {
        return NextResponse.json(
          { success: false, error: "Ya postulaste a esta oferta" },
          { status: 409 },
        );
      }

      // Update persona contact info + any newly provided optional fields
      await prisma.opsPersona.update({
        where: { id: existingPersona.id },
        data: {
          email: body.email,
          phoneMobile: body.phoneMobile,
          ...buildPersonaExtendedData(body),
        },
      });

      // Optional: bank account + documents for existing persona
      if (body.bankCode && body.bankAccountNumber && body.bankAccountType) {
        await prisma.opsCuentaBancaria.create({
          data: {
            tenantId,
            guardiaId,
            bankCode: body.bankCode,
            bankName:
              CHILE_BANKS.find((b) => b.code === body.bankCode)?.name ?? body.bankCode,
            accountType: body.bankAccountType,
            accountNumber: body.bankAccountNumber,
            holderName: `${body.firstName} ${body.lastName}`.trim(),
            holderRut: body.rut,
            isDefault: false,
          },
        });
      }
      if (body.documentos && body.documentos.length > 0) {
        await prisma.opsDocumentoPersona.createMany({
          data: body.documentos.map((doc) => ({
            tenantId,
            guardiaId,
            type: doc.code,
            fileUrl: doc.fileUrl,
            fileName: doc.fileName,
            mimeType: doc.mimeType,
            status: "pendiente",
          })),
        });
      }
    } else {
      // Create new persona + guardia in transaction
      const result = await createPersonaAndGuardia(tenantId, body);
      guardiaId = result.guardiaId;
    }

    // Calculate match score
    let matchScore: number | null = null;
    let matchDetalle: object | null = null;
    try {
      const { calcularMatchScore } = await import("@/lib/ats/match.service");
      const { getAtsConfig } = await import("@/lib/ats/config");
      const config = await getAtsConfig(tenantId);
      const match = await calcularMatchScore(guardiaId, {
        installationLat: null,
        installationLng: null,
        requiereOS10: job.requiereOS10,
        requiereMovilizacion: job.requiereMovilizacion,
        turno: job.turno,
        rentaMin: job.rentaMin,
        rentaMax: job.rentaMax,
        experienciaMinAnios: job.experienciaMinAnios,
        genero: job.genero,
      }, config);
      matchScore = match.score;
      matchDetalle = match.detalle;
    } catch {
      // Match service unavailable — non-critical
    }

    // Create ATS application
    const application = await prisma.atsApplication.create({
      data: {
        tenantId,
        jobPostingId: body.jobPostingId,
        guardiaId,
        etapa: "POSTULADO",
        fuente: "pagina_empleo",
        matchScore,
        matchDetalle: matchDetalle ?? undefined,
      },
      select: { id: true },
    });

    // Send notification (non-blocking)
    try {
      const fullName = `${body.firstName} ${body.lastName}`.trim();
      const { sendNotification } = await import("@/lib/notification-service");
      await sendNotification({
        tenantId,
        type: "new_postulacion",
        title: `Nueva postulación ATS: ${fullName}`,
        message: `${fullName} postuló a "${job.titulo}" desde la página pública.`,
        link: `/ops/ats/${job.id}`,
        data: {
          guardiaId,
          applicationId: application.id,
          jobTitle: job.titulo,
          email: body.email,
        },
      });
    } catch (e) {
      console.warn("[ATS_PUBLIC_POSTULAR] Notification failed:", e);
    }

    return NextResponse.json(
      {
        success: true,
        data: {
          applicationId: application.id,
          guardiaId,
          message: "Postulación enviada correctamente",
        },
      },
      { status: 201 },
    );
  } catch (error) {
    console.error("[ATS_PUBLIC_POSTULAR] Error:", error);
    return NextResponse.json(
      { success: false, error: "No se pudo enviar la postulación" },
      { status: 500 },
    );
  }
}

/* ------------------------------------------------------------------ */
/*  Create persona + guardia for first-time applicants                */
/* ------------------------------------------------------------------ */

async function createPersonaAndGuardia(
  tenantId: string,
  body: z.infer<typeof atsPostulacionSchema>,
): Promise<{ guardiaId: string }> {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const guardia = await prisma.$transaction(async (tx) => {
        const persona = await tx.opsPersona.create({
          data: {
            tenantId,
            firstName: body.firstName,
            lastName: body.lastName,
            rut: body.rut,
            email: body.email,
            phoneMobile: body.phoneMobile,
            hasMobilization: body.tieneMovilizacion,
            status: "active",
            ...buildPersonaExtendedData(body),
          },
        });

        const code = await generateUniqueGuardiaCode(tx, tenantId);
        const g = await tx.opsGuardia.create({
          data: {
            tenantId,
            personaId: persona.id,
            code,
            lifecycleStatus: "postulante",
            status: lifecycleToLegacyStatus("postulante"),
            os10: body.tieneOS10,
          },
          select: { id: true },
        });

        if (body.bankCode && body.bankAccountNumber && body.bankAccountType) {
          await tx.opsCuentaBancaria.create({
            data: {
              tenantId,
              guardiaId: g.id,
              bankCode: body.bankCode,
              bankName:
                CHILE_BANKS.find((b) => b.code === body.bankCode)?.name ?? body.bankCode,
              accountType: body.bankAccountType,
              accountNumber: body.bankAccountNumber,
              holderName: `${body.firstName} ${body.lastName}`.trim(),
              holderRut: body.rut,
              isDefault: true,
            },
          });
        }

        if (body.documentos && body.documentos.length > 0) {
          await tx.opsDocumentoPersona.createMany({
            data: body.documentos.map((doc) => ({
              tenantId,
              guardiaId: g.id,
              type: doc.code,
              fileUrl: doc.fileUrl,
              fileName: doc.fileName,
              mimeType: doc.mimeType,
              status: "pendiente",
            })),
          });
        }

        await tx.opsGuardiaHistory.create({
          data: {
            tenantId,
            guardiaId: g.id,
            eventType: "ats_public_application",
            newValue: {
              source: "pagina_empleo",
              experienciaAnios: body.experienciaAnios,
            },
          },
        });

        return g;
      });

      return { guardiaId: guardia.id };
    } catch (error) {
      const duplicateCodeError =
        error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
      if (!duplicateCodeError || attempt === 3) throw error;
    }
  }

  throw new Error("Failed to generate unique guardia code");
}
