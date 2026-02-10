/**
 * Zod validation schemas for the Document Management System
 */

import { z } from "zod";

// ── Template schemas ─────────────────────────────────────────

const docModuleEnum = z.enum(["crm", "payroll", "legal", "mail", "whatsapp"]);

export const createDocTemplateSchema = z.object({
  name: z.string().min(1, "Nombre requerido").max(200),
  description: z.string().max(500).optional(),
  content: z.any(), // Tiptap JSON
  module: docModuleEnum,
  category: z.string().min(1, "Categoría requerida"),
  tokensUsed: z.array(z.string()).optional(),
  isDefault: z.boolean().optional(),
  usageSlug: z.string().max(80).optional().nullable(),
});

export const updateDocTemplateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(500).optional().nullable(),
  content: z.any().optional(),
  module: docModuleEnum.optional(),
  category: z.string().min(1).optional(),
  tokensUsed: z.array(z.string()).optional(),
  isActive: z.boolean().optional(),
  isDefault: z.boolean().optional(),
  usageSlug: z.string().max(80).optional().nullable(),
  changeNote: z.string().max(200).optional(),
});

// ── Document schemas ─────────────────────────────────────────

export const createDocumentSchema = z.object({
  templateId: z.string().uuid().optional(),
  title: z.string().min(1, "Título requerido").max(300),
  content: z.any(), // Tiptap JSON (resolved or with tokens)
  tokenValues: z.record(z.string(), z.string()).optional(),
  module: docModuleEnum,
  category: z.string().min(1, "Categoría requerida"),
  effectiveDate: z.string().optional().nullable(),
  expirationDate: z.string().optional().nullable(),
  alertDaysBefore: z.number().int().min(1).max(365).optional(),
  associations: z
    .array(
      z.object({
        entityType: z.string().min(1),
        entityId: z.string().uuid(),
        role: z.enum(["primary", "related", "copy"]).optional(),
      })
    )
    .optional(),
});

export const updateDocumentSchema = z.object({
  title: z.string().min(1).max(300).optional(),
  content: z.any().optional(),
  tokenValues: z.record(z.string(), z.string()).optional(),
  status: z
    .enum(["draft", "review", "approved", "active", "expiring", "expired", "renewed"])
    .optional(),
  effectiveDate: z.string().optional().nullable(),
  expirationDate: z.string().optional().nullable(),
  renewalDate: z.string().optional().nullable(),
  alertDaysBefore: z.number().int().min(1).max(365).optional(),
  associations: z
    .array(
      z.object({
        entityType: z.string().min(1),
        entityId: z.string().uuid(),
        role: z.enum(["primary", "related", "copy"]).optional(),
      })
    )
    .optional(),
});

// ── Token resolve schema ─────────────────────────────────────

export const resolveTokensSchema = z.object({
  content: z.any(), // Tiptap JSON with tokens
  accountId: z.string().uuid().optional(),
  contactId: z.string().uuid().optional(),
  installationId: z.string().uuid().optional(),
  dealId: z.string().uuid().optional(),
  quoteId: z.string().uuid().optional(),
});
