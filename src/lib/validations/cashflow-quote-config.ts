import { z } from "zod";

export const cashflowQuoteConfigSchema = z.object({
  installationId: z.string().uuid().nullable().optional(),
  paymentDayMode: z
    .enum(["SPECIFIC_DAY", "FIRST_BUSINESS_DAY", "FIRST_MONDAY", "LAST_BUSINESS_DAY"])
    .optional(),
  paymentDays: z.number().int().min(1).max(28).optional(),
});
