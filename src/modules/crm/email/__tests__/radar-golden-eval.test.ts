/**
 * Eval del clasificador Radar contra el golden set (A13, PR-08).
 *
 * Corre SOLO con RADAR_EVAL=1 (requiere proveedor de IA configurado en la BD
 * del entorno — llama al modelo real). En CI sin credenciales se salta y la
 * suite queda verde; correrlo manualmente antes de tocar el prompt:
 *
 *   RADAR_EVAL=1 npx vitest run src/modules/crm/email/__tests__/radar-golden-eval.test.ts
 *
 * Falla si la accuracy de categoría cae bajo el umbral (regresión de prompt).
 */
import { describe, expect, it } from "vitest";
import { RADAR_GOLDEN_SET } from "./fixtures/radar-golden-set";

const RUN_EVAL = process.env.RADAR_EVAL === "1";
const CATEGORY_THRESHOLD = 0.8;
const INTENT_THRESHOLD = 0.7;

describe.skipIf(!RUN_EVAL)("Radar golden set eval (RADAR_EVAL=1)", () => {
  it(
    `accuracy de categoría ≥ ${CATEGORY_THRESHOLD} e intención ≥ ${INTENT_THRESHOLD} sobre ${RADAR_GOLDEN_SET.length} correos`,
    async () => {
      const { classifyThread } = await import("../radar-classify-ai");
      let categoryHits = 0;
      let intentHits = 0;
      const failures: string[] = [];
      for (const example of RADAR_GOLDEN_SET) {
        const result = await classifyThread({
          tenantId: process.env.RADAR_EVAL_TENANT ?? "eval",
          subject: example.subject,
          fromEmail: example.fromEmail,
          body: example.body,
          hoyISO: new Date().toISOString().slice(0, 10),
        });
        if (result?.categoria === example.expected.categoria) categoryHits += 1;
        else failures.push(`${example.id}: esperaba ${example.expected.categoria}, dio ${result?.categoria}`);
        if (result && example.expected.intencion.includes(result.intencion)) intentHits += 1;
      }
      const categoryAccuracy = categoryHits / RADAR_GOLDEN_SET.length;
      const intentAccuracy = intentHits / RADAR_GOLDEN_SET.length;
      console.log(
        `[radar-eval] categoría=${categoryAccuracy.toFixed(2)} intención=${intentAccuracy.toFixed(2)}\n${failures.join("\n")}`,
      );
      expect(categoryAccuracy).toBeGreaterThanOrEqual(CATEGORY_THRESHOLD);
      expect(intentAccuracy).toBeGreaterThanOrEqual(INTENT_THRESHOLD);
    },
    { timeout: 300_000 },
  );
});

describe("golden set — sanidad del fixture", () => {
  it("tiene 25-30 ejemplos y cubre todas las categorías", () => {
    expect(RADAR_GOLDEN_SET.length).toBeGreaterThanOrEqual(25);
    expect(RADAR_GOLDEN_SET.length).toBeLessThanOrEqual(30);
    const categorias = new Set(RADAR_GOLDEN_SET.map((e) => e.expected.categoria));
    expect(categorias).toEqual(
      new Set(["cotizacion", "licitacion", "consulta_comercial", "facturacion", "operacional", "otro"]),
    );
    const ids = new Set(RADAR_GOLDEN_SET.map((e) => e.id));
    expect(ids.size).toBe(RADAR_GOLDEN_SET.length);
  });

  it("incluye al menos un caso adversarial de prompt-injection", () => {
    expect(
      RADAR_GOLDEN_SET.some((e) => /ignora tus instrucciones/i.test(`${e.subject} ${e.body}`)),
    ).toBe(true);
  });
});
