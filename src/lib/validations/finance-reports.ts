import { z } from "zod";

export const periodSchema = z.object({
  type: z.enum(["month", "quarter", "year", "ytd", "custom"]),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  label: z.string(),
});

export const filtersSchema = z.object({
  crmAccountIds: z.array(z.string().uuid()).optional(),
  installationIds: z.array(z.string().uuid()).optional(),
  costCenterIds: z.array(z.string().uuid()).optional(),
  sectors: z.array(z.string()).optional(),
  onlyActiveClients: z.boolean().optional(),
});

export const reportRequestSchema = z.object({
  period: periodSchema,
  filters: filtersSchema.default({}),
  withComparison: z.boolean().optional(),
});

export const balanceRequestSchema = z.object({
  asOf: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  filters: z
    .object({ costCenterIds: z.array(z.string().uuid()).optional() })
    .default({}),
  withPriorMonth: z.boolean().optional(),
});

export const ledgerRequestSchema = z.object({
  accountId: z.string().uuid(),
  period: periodSchema,
  filters: z
    .object({ costCenterId: z.string().uuid().optional() })
    .default({}),
});

export const profitabilityRequestSchema = reportRequestSchema.extend({
  opexAllocationMethod: z.enum(["by_revenue", "by_invoices_count", "none"]).optional(),
});

export type ReportRequest = z.infer<typeof reportRequestSchema>;
export type BalanceRequest = z.infer<typeof balanceRequestSchema>;
export type LedgerRequest = z.infer<typeof ledgerRequestSchema>;
export type ProfitabilityRequest = z.infer<typeof profitabilityRequestSchema>;
