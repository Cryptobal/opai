/**
 * Zod schemas para endpoints de onboarding del cliente.
 */

import { z } from "zod";

export const playbookCreateSchema = z.object({
  name: z.string().min(1).max(120),
  description: z.string().optional(),
  cloneFromDefault: z.boolean().optional(),
  isDefault: z.boolean().optional(),
});

export const playbookPatchSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  description: z.string().optional(),
  isActive: z.boolean().optional(),
  isDefault: z.boolean().optional(),
});

export const playbookStepCreateSchema = z.object({
  phase: z.number().int().min(1).max(10),
  sortOrder: z.number().int().min(0).optional(),
  slug: z.string().min(1).max(120),
  title: z.string().min(1).max(200),
  description: z.string().optional(),
  ticketTypeSlug: z.string().min(1),
  defaultAssignedTeam: z.string().min(1),
  defaultAssignedUserId: z.string().optional().nullable(),
  defaultPriority: z.string().default("p3"),
  dueDateOffsetDays: z.number().int(),
  defaultApplies: z.boolean().default(true),
});

export const onboardingStartStepSchema = z.object({
  playbookStepId: z.string().uuid().optional(),
  isCustom: z.boolean().optional(),
  applies: z.boolean(),
  title: z.string().min(1).max(200),
  description: z.string().optional(),
  ticketTypeSlug: z.string().optional(),
  assignedTeam: z.string().optional(),
  assignedToUserId: z.string().optional().nullable(),
  priority: z.string().optional(),
  dueDateOffsetDays: z.number().int().optional(),
  saveToPlaybook: z.boolean().optional(),
  phase: z.number().int().optional(),
  sortOrder: z.number().int().optional(),
});

export const onboardingStartSchema = z.object({
  dealId: z.string().uuid(),
  playbookId: z.string().uuid(),
  serviceStartDate: z.string().min(8),
  notes: z.string().optional(),
  steps: z.array(onboardingStartStepSchema).min(1),
});

export type OnboardingStartInput = z.infer<typeof onboardingStartSchema>;
export type OnboardingStartStepInput = z.infer<typeof onboardingStartStepSchema>;
