import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { resolveTenantFromSlug } from "@/lib/tenant";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}
import {
  AFP_CHILE,
  BANK_ACCOUNT_TYPES,
  CHILE_BANKS,
  CHILE_BANK_CODES,
  HEALTH_SYSTEMS,
  ISAPRES_CHILE,
  PANTS_SIZES,
  PAISES_AMERICA,
  PERSON_SEX,
  SHOE_SIZES,
  TOP_GARMENT_SIZES,
  isChileanRutFormat,
  isValidChileanRut,
  isValidMobileNineDigits,
  lifecycleToLegacyStatus,
  normalizeMobileNineDigits,
  normalizeNullable,
  normalizeRut,
} from "@/lib/personas";
import { isValidPostulacionToken } from "@/lib/postulacion-token";
import { getPostulacionDocumentTypesVisibleOnGuardForm } from "@/lib/postulacion-documentos";

const postulacionSchema = z.object({
  token: z.string().trim().min(8, "Token inválido"),
  firstName: z.string().trim().min(1, "Nombre es requerido").max(100),
  lastName: z.string().trim().min(1, "Apellido es requerido").max(100),
  rut: z
    .string()
    .trim()
    .refine((v) => isChileanRutFormat(v), "RUT debe ir sin puntos y con guión")
    .refine((v) => isValidChileanRut(v), "RUT chileno inválido")
    .transform((v) => normalizeRut(v)),
  email: z.string().trim().email("Email inválido").max(200),
  phoneMobile: z
    .string()
    .trim()
    .refine((v) => isValidMobileNineDigits(v), "Celular debe tener exactamente 9 dígitos")
    .transform((v) => normalizeMobileNineDigits(v)),
  addressFormatted: z.string().trim().min(5, "Dirección es requerida").max(300),
  googlePlaceId: z.string().trim().min(10, "Debes seleccionar dirección desde Google Maps"),
  commune: z.string().trim().max(120).optional().nullable(),
  city: z.string().trim().max(120).optional().nullable(),
  region: z.string().trim().max(120).optional().nullable(),
  lat: z.union([z.number(), z.string().regex(/^-?\d+(\.\d+)?$/)]),
  lng: z.union([z.number(), z.string().regex(/^-?\d+(\.\d+)?$/)]),
  birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha de nacimiento inválida"),
  sex: z.enum(PERSON_SEX),
  nacionalidad: z.enum(PAISES_AMERICA).optional().nullable(),
  afp: z.enum(AFP_CHILE),
  healthSystem: z.enum(HEALTH_SYSTEMS),
  isapreName: z.enum(ISAPRES_CHILE).optional().nullable(),
  isapreHasExtraPercent: z.boolean(),
  isapreExtraPercent: z.union([z.number(), z.string().regex(/^\d+(\.\d{1,2})?$/)]).optional().nullable(),
  hasMobilization: z.boolean(),
  availableExtraShifts: z.boolean(),
  shoeSize: z.string().trim().refine((v) => SHOE_SIZES.includes(v), "Calzado inválido").optional().nullable(),
  pantsSize: z.string().trim().refine((v) => PANTS_SIZES.includes(v), "Pantalón inválido").optional().nullable(),
  tshirtSize: z.enum(TOP_GARMENT_SIZES).optional().nullable(),
  shirtSize: z.enum(TOP_GARMENT_SIZES).optional().nullable(),
  geologoSize: z.enum(TOP_GARMENT_SIZES).optional().nullable(),
  polarSize: z.enum(TOP_GARMENT_SIZES).optional().nullable(),
  jacketSize: z.enum(TOP_GARMENT_SIZES).optional().nullable(),
  heightCm: z.number().min(120).max(230).optional().nullable(),
  weightKg: z.number().min(35).max(250).optional().nullable(),
  bankCode: z.string().trim().refine((v) => CHILE_BANK_CODES.includes(v), "Banco inválido"),
  accountType: z.enum(BANK_ACCOUNT_TYPES),
  accountNumber: z.string().trim().min(4, "Número de cuenta requerido").max(100),
  notes: z.string().trim().max(2000).optional().nullable(),
  documents: z
    .array(
      z.object({
        type: z.string().trim().min(1).max(80),
        fileUrl: z
          .string()
          .trim()
          .max(2000)
          .refine(
            (value) =>
              value.startsWith("/uploads/guardias/") || /^https?:\/\//i.test(value),
            "Archivo inválido (URL o path /uploads/guardias/)"
          ),
        fileName: z.string().trim().max(300).optional().nullable(),
        mimeType: z.string().trim().max(120).optional().nullable(),
      })
    )
    .min(1, "Debes subir al menos un documento"),
}).superRefine((val, ctx) => {
  if (val.healthSystem === "isapre" && !val.isapreName) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["isapreName"],
      message: "Debes indicar la Isapre",
    });
  }
  if (val.healthSystem === "isapre" && val.isapreHasExtraPercent) {
    const pct = Number(val.isapreExtraPercent ?? 0);
    if (!Number.isFinite(pct) || pct <= 7) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["isapreExtraPercent"],
        message: "Debe indicar porcentaje mayor a 7%",
      });
    }
  }
});

function buildNextGuardiaCode(lastCode?: string | null): string {
  if (!lastCode) return "G-000001";
  const match = /^G-(\d{6})$/.exec(lastCode);
  const next = (match ? Number(match[1]) : 0) + 1;
  return `G-${String(next).padStart(6, "0")}`;
}

async function generateUniqueGuardiaCode(
  tx: Prisma.TransactionClient,
  tenantId: string
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

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ tenantSlug: string }> },
) {
  const { tenantSlug } = await params;
  const tenant = await resolveTenantFromSlug(tenantSlug);
  if (!tenant) {
    return NextResponse.json(
      { success: false, error: "Tenant not found" },
      { status: 404, headers: corsHeaders },
    );
  }
  const tenantId = tenant.id;

  try {
    const raw = await request.json();
    const parsed = postulacionSchema.safeParse(raw);
    if (!parsed.success) {
      const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
      return NextResponse.json({ success: false, error: issues }, { status: 400, headers: corsHeaders });
    }

    const body = parsed.data;
    if (!isValidPostulacionToken(body.token)) {
      return NextResponse.json({ success: false, error: "Token de postulación inválido" }, { status: 403, headers: corsHeaders });
    }

    const docConfig = await getPostulacionDocumentTypesVisibleOnGuardForm(tenantId);
    const allowedTypes = new Set(docConfig.map((d) => d.code));
    const requiredTypes = new Set(docConfig.filter((d) => d.required).map((d) => d.code));
    const submittedTypes = new Set(body.documents.map((d) => d.type));
    for (const d of body.documents) {
      if (!allowedTypes.has(d.type)) {
        return NextResponse.json(
          { success: false, error: `Tipo de documento no permitido: ${d.type}` },
          { status: 400, headers: corsHeaders }
        );
      }
    }
    for (const code of requiredTypes) {
      if (!submittedTypes.has(code)) {
        const label = docConfig.find((c) => c.code === code)?.label ?? code;
        return NextResponse.json(
          { success: false, error: `Documento obligatorio faltante: ${label}` },
          { status: 400, headers: corsHeaders }
        );
      }
    }
    const existingByRut = await prisma.opsPersona.findFirst({
      where: { tenantId, rut: body.rut },
      select: { id: true },
    });
    if (existingByRut) {
      return NextResponse.json(
        { success: false, error: "RUT ya ingresado / root ya ingresado. Comunicarse con recursos humanos." },
        { status: 409, headers: corsHeaders }
      );
    }

    let createdGuardia: { id: string; code: string | null } | null = null;
    for (let attempt = 0; attempt < 4; attempt += 1) {
      try {
        createdGuardia = await prisma.$transaction(async (tx) => {
          const persona = await tx.opsPersona.create({
            data: {
              tenantId,
              firstName: body.firstName,
              lastName: body.lastName,
              rut: body.rut,
              email: normalizeNullable(body.email),
              phoneMobile: normalizeNullable(body.phoneMobile),
              addressFormatted: normalizeNullable(body.addressFormatted),
              googlePlaceId: normalizeNullable(body.googlePlaceId),
              addressSource: "google_places",
              commune: normalizeNullable(body.commune),
              city: normalizeNullable(body.city),
              region: normalizeNullable(body.region),
              lat: new Prisma.Decimal(Number(body.lat)),
              lng: new Prisma.Decimal(Number(body.lng)),
              birthDate: new Date(`${body.birthDate}T00:00:00.000Z`),
              sex: body.sex,
              nacionalidad: normalizeNullable(body.nacionalidad),
              afp: body.afp,
              healthSystem: body.healthSystem,
              isapreName: normalizeNullable(body.isapreName),
              isapreHasExtraPercent: body.isapreHasExtraPercent,
              isapreExtraPercent:
                body.isapreHasExtraPercent && body.isapreExtraPercent !== undefined
                  ? new Prisma.Decimal(Number(body.isapreExtraPercent))
                  : null,
              hasMobilization: body.hasMobilization,
              shoeSize: normalizeNullable(body.shoeSize),
              pantsSize: normalizeNullable(body.pantsSize),
              tshirtSize: normalizeNullable(body.tshirtSize),
              shirtSize: normalizeNullable(body.shirtSize),
              geologoSize: normalizeNullable(body.geologoSize),
              polarSize: normalizeNullable(body.polarSize),
              jacketSize: normalizeNullable(body.jacketSize),
              heightCm:
                body.heightCm !== undefined && body.heightCm !== null
                  ? new Prisma.Decimal(body.heightCm)
                  : null,
              weightKg:
                body.weightKg !== undefined && body.weightKg !== null
                  ? new Prisma.Decimal(body.weightKg)
                  : null,
              status: "active",
            },
          });

          const code = await generateUniqueGuardiaCode(tx, tenantId);
          const guardia = await tx.opsGuardia.create({
            data: {
              tenantId,
              personaId: persona.id,
              code,
              lifecycleStatus: "postulante",
              status: lifecycleToLegacyStatus("postulante"),
              availableExtraShifts: body.availableExtraShifts,
            },
            select: { id: true, code: true },
          });

          await tx.opsCuentaBancaria.create({
            data: {
              tenantId,
              guardiaId: guardia.id,
              bankCode: body.bankCode,
              bankName: CHILE_BANKS.find((item) => item.code === body.bankCode)?.name ?? body.bankCode,
              accountType: body.accountType,
              accountNumber: body.accountNumber,
              holderName: `${body.firstName} ${body.lastName}`.trim(),
              holderRut: body.rut,
              isDefault: true,
            },
          });

          if (body.documents.length > 0) {
            await tx.opsDocumentoPersona.createMany({
              data: body.documents.map((doc) => ({
                tenantId,
                guardiaId: guardia.id,
                type: doc.type,
                fileUrl: doc.fileUrl,
                fileName: doc.fileName ?? null,
                mimeType: doc.mimeType ?? null,
                status: "pendiente",
              })),
            });
          }

          if (body.notes && body.notes.trim()) {
            await tx.opsComentarioGuardia.create({
              data: {
                tenantId,
                guardiaId: guardia.id,
                comment: body.notes.trim(),
                createdBy: "public_postulacion",
              },
            });
          }

          await tx.opsGuardiaHistory.create({
            data: {
              tenantId,
              guardiaId: guardia.id,
              eventType: "public_postulation_submitted",
              newValue: {
                source: "public_postulation",
                docs: body.documents.length,
              },
            },
          });

          return guardia;
        });
        break;
      } catch (error) {
        const duplicateCodeError =
          error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
        if (!duplicateCodeError || attempt === 3) throw error;
      }
    }

    // Link Google OAuth data if this came from a Google sign-in flow
    if (createdGuardia) {
      try {
        const cookieStore = await cookies();
        const pendingCookie = cookieStore.get("google_pending_registration");
        if (pendingCookie?.value) {
          const pending = JSON.parse(pendingCookie.value);
          if (pending.googleId) {
            await prisma.opsGuardia.update({
              where: { id: createdGuardia.id },
              data: { googleAuthId: pending.googleId, googleEmail: pending.googleEmail },
            });
          }
        }
      } catch {
        // Cookie parsing or update failed — non-critical
      }
    }

    if (createdGuardia) {
      try {
        const fullName = `${body.firstName} ${body.lastName}`.trim();
        const { sendNotification } = await import("@/lib/notification-service");
        await sendNotification({
          tenantId,
          type: "new_postulacion",
          title: `Nueva postulación: ${fullName}`,
          message: `${fullName} envió el formulario de postulación (${body.documents.length} documento(s)).`,
          link: `/personas/guardias/${createdGuardia.id}`,
          data: {
            guardiaId: createdGuardia.id,
            code: createdGuardia.code,
            email: body.email,
          },
        });
      } catch (e) {
        console.warn("[POSTULACION] Failed to create notification", e);
      }
    }

    return NextResponse.json(
      {
        success: true,
        data: {
          guardiaId: createdGuardia?.id,
          code: createdGuardia?.code ?? null,
          message: "Postulación enviada correctamente",
        },
      },
      { status: 201, headers: corsHeaders }
    );
  } catch (error) {
    console.error("[POSTULACION] Error creating public postulation:", error);
    return NextResponse.json(
      { success: false, error: "No se pudo enviar la postulación" },
      { status: 500, headers: corsHeaders }
    );
  }
}
