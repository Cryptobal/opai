/**
 * Tests del schema Zod del endpoint POST /api/finance/cashflow/cobranza/send.
 *
 * Sigue el patrón del repo: re-implementamos el schema localmente para no
 * cargar el route handler (lo que activa Next.js y rompe en jsdom). Esta
 * copia DEBE permanecer en sync con el route.ts.
 *
 * También verificamos la lógica de sugerencia de slug en función de
 * `daysOverdue` (replicada desde CobranzaSendDialog).
 */

import { describe, it, expect } from "vitest";
import { z } from "zod";

const sendSchema = z.object({
  dteId: z.string().uuid(),
  channel: z.enum(["whatsapp", "email", "both"]),
  contactIds: z.array(z.string().uuid()).min(1),
  slug: z.enum(["cobranza_amable", "cobranza_firme", "cobranza_prejudicial"]),
  customMessage: z.string().optional(),
});

const UUID = "11111111-1111-4111-8111-111111111111";
const UUID_2 = "22222222-2222-4222-8222-222222222222";

function suggestSlug(daysOverdue: number) {
  if (daysOverdue <= 7) return "cobranza_amable";
  if (daysOverdue <= 30) return "cobranza_firme";
  return "cobranza_prejudicial";
}

describe("cobranza/send schema", () => {
  it("acepta un body válido con canal whatsapp", () => {
    const r = sendSchema.safeParse({
      dteId: UUID,
      channel: "whatsapp",
      contactIds: [UUID_2],
      slug: "cobranza_amable",
    });
    expect(r.success).toBe(true);
  });

  it("acepta un body válido con canal email + customMessage", () => {
    const r = sendSchema.safeParse({
      dteId: UUID,
      channel: "email",
      contactIds: [UUID_2],
      slug: "cobranza_firme",
      customMessage: "Te recuerdo el pago…",
    });
    expect(r.success).toBe(true);
  });

  it("acepta canal both", () => {
    const r = sendSchema.safeParse({
      dteId: UUID,
      channel: "both",
      contactIds: [UUID_2],
      slug: "cobranza_prejudicial",
    });
    expect(r.success).toBe(true);
  });

  it("rechaza dteId no UUID", () => {
    const r = sendSchema.safeParse({
      dteId: "not-a-uuid",
      channel: "whatsapp",
      contactIds: [UUID_2],
      slug: "cobranza_amable",
    });
    expect(r.success).toBe(false);
  });

  it("rechaza slug inválido", () => {
    const r = sendSchema.safeParse({
      dteId: UUID,
      channel: "whatsapp",
      contactIds: [UUID_2],
      // @ts-expect-error: intencional para test
      slug: "cobranza_extra",
    });
    expect(r.success).toBe(false);
  });

  it("rechaza canal inválido", () => {
    const r = sendSchema.safeParse({
      dteId: UUID,
      // @ts-expect-error: intencional para test
      channel: "sms",
      contactIds: [UUID_2],
      slug: "cobranza_amable",
    });
    expect(r.success).toBe(false);
  });

  it("rechaza contactIds vacío", () => {
    const r = sendSchema.safeParse({
      dteId: UUID,
      channel: "whatsapp",
      contactIds: [],
      slug: "cobranza_amable",
    });
    expect(r.success).toBe(false);
  });

  it("rechaza contactIds con un UUID inválido", () => {
    const r = sendSchema.safeParse({
      dteId: UUID,
      channel: "whatsapp",
      contactIds: [UUID_2, "not-uuid"],
      slug: "cobranza_amable",
    });
    expect(r.success).toBe(false);
  });
});

describe("cobranza slug suggestion", () => {
  it("0 días → amable (factura por vencer o al día)", () => {
    expect(suggestSlug(0)).toBe("cobranza_amable");
  });

  it("7 días de mora → amable (frontera)", () => {
    expect(suggestSlug(7)).toBe("cobranza_amable");
  });

  it("8 días → firme", () => {
    expect(suggestSlug(8)).toBe("cobranza_firme");
  });

  it("30 días → firme (frontera)", () => {
    expect(suggestSlug(30)).toBe("cobranza_firme");
  });

  it("31 días → prejudicial", () => {
    expect(suggestSlug(31)).toBe("cobranza_prejudicial");
  });

  it("90 días → prejudicial", () => {
    expect(suggestSlug(90)).toBe("cobranza_prejudicial");
  });
});

describe("cobranza guardrail — payment status", () => {
  // El endpoint rechaza DTEs con paymentStatus PAID o CEDED. Esta es la
  // misma lógica que aplicamos en el route handler; la replicamos como
  // función pura aquí para no levantar Prisma.
  const REJECTED_STATUSES = new Set(["PAID", "CEDED"]);

  it("rechaza PAID", () => {
    expect(REJECTED_STATUSES.has("PAID")).toBe(true);
  });

  it("rechaza CEDED", () => {
    expect(REJECTED_STATUSES.has("CEDED")).toBe(true);
  });

  it("permite UNPAID", () => {
    expect(REJECTED_STATUSES.has("UNPAID")).toBe(false);
  });

  it("permite PARTIAL", () => {
    expect(REJECTED_STATUSES.has("PARTIAL")).toBe(false);
  });

  it("permite OVERDUE", () => {
    expect(REJECTED_STATUSES.has("OVERDUE")).toBe(false);
  });
});
