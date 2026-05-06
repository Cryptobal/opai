/**
 * Tests del schema Zod + pickPersistableFields del endpoint
 * /api/finance/config/dte-provider PUT.
 *
 * Originalmente el PUT crasheaba con "Unexpected end of JSON input"
 * en el frontend porque el handler reventaba sin try/catch ante:
 *   - Strings vacíos en campos requeridos por regex (.email(), .regex())
 *   - Campos del UI todavía no presentes en el modelo Prisma
 *
 * Estos tests cubren los shapes reales que envía DteConfigClient para
 * que un cambio futuro no vuelva a romper el guardado.
 */

import { describe, it, expect } from "vitest";
import { z } from "zod";

// Re-implementación local para testear sin importar el route handler
// (importar el route handler activa Next.js y rompe en jsdom). Esta
// copia DEBE permanecer en sync con la del route.ts.
const optionalText = (max: number) =>
  z
    .union([z.literal(""), z.string().max(max)])
    .nullable()
    .optional();

const updateConfigSchema = z
  .object({
    provider: z.enum(["SIMPLEAPI", "SIMPLEFACTURA", "STUB"]).optional(),
    environment: z.enum(["CERTIFICATION", "PRODUCTION"]).optional(),
    isActive: z.boolean().optional(),
    emisorRut: z
      .union([z.literal(""), z.string().regex(/^\d{1,8}-[\dKk]$/, "RUT inválido")])
      .nullable()
      .optional(),
    emisorRazonSocial: optionalText(200),
    emisorGiro: optionalText(200),
    emisorActeco: z.number().int().nullable().optional(),
    emisorDireccion: optionalText(200),
    emisorComuna: optionalText(80),
    emisorCiudad: optionalText(80),
    emisorTelefono: optionalText(40),
    emisorEmail: z
      .union([z.literal(""), z.string().email("Email inválido")])
      .nullable()
      .optional(),
    resolNumero: z.number().int().nullable().optional(),
    resolFecha: z.string().nullable().optional(),
    alertEmails: z
      .array(z.string().email("Email de alerta inválido"))
      .max(10, "Máximo 10 emails de alerta")
      .optional(),
    logoBase64: z
      .string()
      .max(800 * 1024, "Logo demasiado grande (máx 800KB en base64)")
      .nullable()
      .optional(),
  })
  .passthrough();

const PERSISTABLE_KEYS = [
  "provider",
  "environment",
  "isActive",
  "emisorRut",
  "emisorRazonSocial",
  "emisorGiro",
  "emisorActeco",
  "emisorDireccion",
  "emisorComuna",
  "emisorCiudad",
  "emisorTelefono",
  "emisorEmail",
  "resolNumero",
  "alertEmails",
  "logoBase64",
] as const;

function pickPersistableFields(
  data: z.infer<typeof updateConfigSchema>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of PERSISTABLE_KEYS) {
    const value = (data as Record<string, unknown>)[key];
    if (value === undefined) continue;
    out[key] = value === "" ? null : value;
  }
  return out;
}

describe("DteConfig PUT validation", () => {
  it("acepta el body completo que envía DteConfigClient (caso real Gard)", () => {
    const realBody = {
      environment: "PRODUCTION",
      isActive: true,
      emisorRut: "11111111-1",
      emisorRazonSocial: "GARD SECURITY SPA",
      emisorGiro: "SERVICIOS DE SEGURIDAD",
      emisorActeco: 801000,
      emisorDireccion: "Lo Fontecilla 201",
      emisorComuna: "Las Condes",
      emisorCiudad: "Santiago",
      emisorTelefono: "+56982307771",
      emisorEmail: "administracion@gard.cl",
      resolNumero: 80,
      resolFecha: "2014-08-22",
      logoBase64: "iVBORw0KGgoAAAANSUhEUgAA...".repeat(100),
      alertEmails: ["administracion@gard.cl"],
    };
    const r = updateConfigSchema.safeParse(realBody);
    expect(r.success).toBe(true);
  });

  it("acepta strings vacíos (DEFAULT_CONFIG inicial)", () => {
    const emptyBody = {
      environment: "CERTIFICATION",
      isActive: false,
      emisorRut: "",
      emisorRazonSocial: "",
      emisorGiro: "",
      emisorActeco: null,
      emisorDireccion: "",
      emisorComuna: "",
      emisorCiudad: "",
      emisorTelefono: "",
      emisorEmail: "",
      resolNumero: null,
      resolFecha: null,
      logoBase64: null,
      alertEmails: [],
    };
    const r = updateConfigSchema.safeParse(emptyBody);
    expect(r.success).toBe(true);
  });

  it("acepta y descarta campos UI no persistibles (passthrough + filter)", () => {
    const bodyWithExtras = {
      environment: "CERTIFICATION",
      emisorRut: "11111111-1",
      // Estos 4 campos están en la UI pero NO en el modelo Prisma.
      // Antes hacían crashear el upsert. Ahora pasan validación y se
      // filtran antes de Prisma.
      defaultXmlRecipientEmails: ["contador@empresa.cl"],
      defaultXmlRecipientAlwaysSend: true,
      emailTemplateSubject: "Su factura {{folio}}",
      emailTemplateBody: "Adjuntamos...",
    };
    const r = updateConfigSchema.safeParse(bodyWithExtras);
    expect(r.success).toBe(true);
    if (!r.success) return;

    const persistable = pickPersistableFields(r.data);
    expect(persistable).not.toHaveProperty("defaultXmlRecipientEmails");
    expect(persistable).not.toHaveProperty("defaultXmlRecipientAlwaysSend");
    expect(persistable).not.toHaveProperty("emailTemplateSubject");
    expect(persistable).not.toHaveProperty("emailTemplateBody");
    expect(persistable.emisorRut).toBe("11111111-1");
    expect(persistable.environment).toBe("CERTIFICATION");
  });

  it("convierte string vacío a null en pickPersistableFields", () => {
    const parsed = updateConfigSchema.parse({
      emisorEmail: "",
      emisorTelefono: "",
      emisorRut: "22222222-2",
    });
    const persistable = pickPersistableFields(parsed);
    expect(persistable.emisorEmail).toBe(null);
    expect(persistable.emisorTelefono).toBe(null);
    expect(persistable.emisorRut).toBe("22222222-2");
  });

  it("rechaza email con formato inválido (no string vacío)", () => {
    const r = updateConfigSchema.safeParse({
      emisorEmail: "no-es-email",
    });
    expect(r.success).toBe(false);
  });

  it("rechaza RUT con formato inválido (no string vacío)", () => {
    const r = updateConfigSchema.safeParse({
      emisorRut: "ABC-X",
    });
    expect(r.success).toBe(false);
  });

  it("rechaza array de alertEmails con un email inválido", () => {
    const r = updateConfigSchema.safeParse({
      alertEmails: ["valido@empresa.cl", "no-es-email"],
    });
    expect(r.success).toBe(false);
  });

  it("rechaza logoBase64 que excede 800KB", () => {
    const r = updateConfigSchema.safeParse({
      logoBase64: "x".repeat(800 * 1024 + 1),
    });
    expect(r.success).toBe(false);
  });
});
