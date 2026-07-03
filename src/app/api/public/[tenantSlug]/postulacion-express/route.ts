import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { resolveTenantFromSlug } from "@/lib/tenant";
import {
  isChileanRutFormat,
  isValidChileanRut,
  isValidMobileNineDigits,
  lifecycleToLegacyStatus,
  normalizeMobileNineDigits,
  normalizeNullable,
  normalizeRut,
} from "@/lib/personas";
import { isValidPostulacionToken } from "@/lib/postulacion-token";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}

const sourceDetailsSchema = z
  .object({
    utmSource: z.string().trim().max(120).optional().nullable(),
    utmMedium: z.string().trim().max(120).optional().nullable(),
    utmCampaign: z.string().trim().max(180).optional().nullable(),
    utmContent: z.string().trim().max(180).optional().nullable(),
    utmTerm: z.string().trim().max(180).optional().nullable(),
    via: z.string().trim().max(60).optional().nullable(),
    ref: z.string().trim().max(120).optional().nullable(),
    referrer: z.string().trim().max(500).optional().nullable(),
    landingPath: z.string().trim().max(500).optional().nullable(),
    gclid: z.string().trim().max(180).optional().nullable(),
    fbclid: z.string().trim().max(180).optional().nullable(),
  })
  .partial()
  .optional()
  .nullable();

const payloadSchema = z.object({
  token: z.string().trim().min(8, "Token inválido"),
  firstName: z.string().trim().min(1, "Nombre requerido").max(100),
  lastName: z.string().trim().min(1, "Apellido requerido").max(100),
  rut: z
    .string()
    .trim()
    .refine((v) => isChileanRutFormat(v), "RUT debe ir sin puntos y con guión")
    .refine((v) => isValidChileanRut(v), "RUT chileno inválido")
    .transform((v) => normalizeRut(v)),
  phoneMobile: z
    .string()
    .trim()
    .refine((v) => isValidMobileNineDigits(v), "Celular debe tener 9 dígitos")
    .transform((v) => normalizeMobileNineDigits(v)),
  email: z.string().trim().email("Email inválido").max(200).optional().nullable(),
  commune: z.string().trim().max(120).optional().nullable(),
  tieneOs10: z.enum(["si", "no", "en_tramite"]).optional().nullable(),
  source: z.string().trim().max(60).optional().nullable(),
  sourceDetails: sourceDetailsSchema,
  referredByAdminId: z.string().trim().max(60).optional().nullable(),
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
  { params }: { params: Promise<{ tenantSlug: string }> }
) {
  const { tenantSlug } = await params;
  const tenant = await resolveTenantFromSlug(tenantSlug);
  if (!tenant) {
    return NextResponse.json(
      { success: false, error: "Tenant not found" },
      { status: 404, headers: corsHeaders }
    );
  }
  const tenantId = tenant.id;

  try {
    const raw = await request.json();
    const parsed = payloadSchema.safeParse(raw);
    if (!parsed.success) {
      const issues = parsed.error.issues
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join("; ");
      return NextResponse.json(
        { success: false, error: issues },
        { status: 400, headers: corsHeaders }
      );
    }

    const body = parsed.data;
    if (!isValidPostulacionToken(body.token)) {
      return NextResponse.json(
        { success: false, error: "Token de postulación inválido" },
        { status: 403, headers: corsHeaders }
      );
    }

    const existingByRut = await prisma.opsPersona.findFirst({
      where: { tenantId, rut: body.rut },
      select: { id: true },
    });
    if (existingByRut) {
      return NextResponse.json(
        {
          success: false,
          error: "RUT_DUPLICADO",
          message:
            "Ya estás en nuestro sistema. Nuestro equipo se pondrá en contacto contigo pronto.",
        },
        { status: 409, headers: corsHeaders }
      );
    }

    let referredByAdminIdValid: string | null = null;
    if (body.referredByAdminId) {
      const adm = await prisma.admin.findFirst({
        where: { id: body.referredByAdminId, tenantId },
        select: { id: true },
      });
      referredByAdminIdValid = adm?.id ?? null;
    }

    const sourceDetailsClean = body.sourceDetails
      ? Object.fromEntries(
          Object.entries(body.sourceDetails).filter(
            ([, v]) => v !== undefined && v !== null && v !== ""
          )
        )
      : null;

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
              commune: normalizeNullable(body.commune),
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
              source: normalizeNullable(body.source) ?? "web_organico",
              sourceDetails: sourceDetailsClean ?? undefined,
              tieneOs10Declarado: normalizeNullable(body.tieneOs10),
              referredByAdminId: referredByAdminIdValid,
            },
            select: { id: true, code: true },
          });

          await tx.opsGuardiaHistory.create({
            data: {
              tenantId,
              guardiaId: guardia.id,
              eventType: "public_postulation_express_submitted",
              newValue: {
                source: body.source ?? "web_organico",
                sourceDetails: sourceDetailsClean,
                tieneOs10: body.tieneOs10 ?? null,
                referredByAdminId: referredByAdminIdValid,
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

    if (createdGuardia) {
      try {
        const fullName = `${body.firstName} ${body.lastName}`.trim();
        const { notify } = await import("@/lib/notifications/notify");
        await notify({
          tenantId,
          type: "new_postulacion",
          audience: "admin",
          title: `Nueva postulación express: ${fullName}`,
          body: `${fullName} envió el formulario express de postulación (origen: ${
            body.source ?? "web"
          }).`,
          link: `/personas/guardias/${createdGuardia.id}`,
          data: {
            guardiaId: createdGuardia.id,
            code: createdGuardia.code,
            origen: body.source ?? "web_organico",
            phone: body.phoneMobile ?? null,
            comuna: body.commune ?? undefined,
          },
        });
      } catch (e) {
        console.warn("[POSTULACION_EXPRESS] notification failed", e);
      }
    }

    return NextResponse.json(
      {
        success: true,
        data: {
          guardiaId: createdGuardia?.id,
          code: createdGuardia?.code ?? null,
          message: "Postulación recibida. Nuestro equipo te contactará pronto.",
        },
      },
      { status: 201, headers: corsHeaders }
    );
  } catch (error) {
    console.error("[POSTULACION_EXPRESS] Error:", error);
    return NextResponse.json(
      { success: false, error: "No se pudo enviar la postulación" },
      { status: 500, headers: corsHeaders }
    );
  }
}
