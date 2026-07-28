import { z } from "zod";

const refineBodySchema = z
  .object({
    answers: z
      .array(
        z.object({
          question: z.string().min(1).max(300),
          answer: z.string().min(1).max(500),
        }),
      )
      .max(10)
      .optional(),
    baseProposal: z.record(z.string(), z.unknown()).optional(),
    locks: z.array(z.string().min(1).max(200)).max(100).optional(),
  })
  .strict();

/** Valida body de extract-structure / refinamiento (puro, sin Next). */
export function parseExtractStructureBody(raw: unknown): {
  ok: true;
  answers?: Array<{ question: string; answer: string }>;
  baseProposal?: Record<string, unknown>;
  locks?: string[];
} | { ok: false; error: string } {
  if (raw == null || (typeof raw === "object" && raw !== null && Object.keys(raw as object).length === 0)) {
    return { ok: true };
  }
  const parsed = refineBodySchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: "Payload inválido para refinamiento" };
  }
  return {
    ok: true,
    answers: parsed.data.answers,
    baseProposal: parsed.data.baseProposal,
    locks: parsed.data.locks,
  };
}
