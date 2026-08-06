/**
 * Schemas Zod compartidos para crear/editar reglas de auto-match.
 * Puro (sin prisma) — usable en route handlers.
 */
import { z } from "zod";

export const conditionItemSchema = z.object({
  field: z.enum(["DESCRIPTION", "REFERENCE", "AMOUNT", "BENEFICIARY_RUT"]),
  operator: z.enum([
    "CONTAINS",
    "STARTS_WITH",
    "EQUALS",
    "IS_EMPTY",
    "AMOUNT_BETWEEN",
    "AMOUNT_GTE",
    "AMOUNT_LTE",
    "RUT_MATCHES",
  ]),
  value: z
    .union([
      z.string(),
      z.array(z.string()).min(1).max(20),
      z.number(),
      z.object({
        min: z.number().optional(),
        max: z.number().optional(),
      }),
      z.null(),
    ])
    .optional(),
});

const legacyActionSchema = z.object({
  handlingMode: z.enum(["RECOGNIZED", "CATEGORIZED"]),
  accountPlanId: z.string().uuid().nullable().optional(),
  supplierId: z.string().uuid().nullable().optional(),
  counterpartyRut: z.string().nullable().optional(),
  requiresReview: z.boolean(),
});

const flowRowActionSchema = z.object({
  kind: z.literal("FLOW_ROW"),
  flowRowId: z.string().uuid(),
  requiresReview: z.boolean().optional(),
});

const tgrActionSchema = z.object({
  kind: z.literal("TGR_PICK"),
  requiresReview: z.boolean().optional(),
});

/** Variantes con `kind` primero para no matchear legacy por accidente. */
export const ruleActionSchema = z.union([
  flowRowActionSchema,
  tgrActionSchema,
  legacyActionSchema,
]);

export function isFlowRowActionBody(
  action: z.infer<typeof ruleActionSchema>,
): action is z.infer<typeof flowRowActionSchema> {
  return "kind" in action && action.kind === "FLOW_ROW";
}
