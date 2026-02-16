/**
 * Zod schemas for CRM API validation
 */

import { z } from "zod";

// ── Lead ──
export const createLeadSchema = z.object({
  companyName: z.string().trim().max(200).optional().nullable(),
  firstName: z.string().trim().max(100).optional().nullable(),
  lastName: z.string().trim().max(100).optional().nullable(),
  email: z.string().trim().email("Email inválido").max(200).optional().nullable().or(z.literal("")),
  phone: z.string().trim().max(30).optional().nullable(),
  source: z.string().trim().max(200).optional().nullable(),
  notes: z.string().trim().max(5000).optional().nullable(),
  industry: z.string().trim().max(100).optional().nullable(),
  address: z.string().trim().max(500).optional().nullable(),
  commune: z.string().trim().max(100).optional().nullable(),
  city: z.string().trim().max(100).optional().nullable(),
  website: z.string().trim().max(500).optional().nullable(),
  serviceType: z.string().trim().max(100).optional().nullable(),
  status: z.enum(["pending", "in_review", "approved", "rejected"]).optional(),
  metadata: z.any().optional().nullable(),
});

export const approveLeadSchema = z.object({
  accountName: z.string().trim().min(1, "Nombre de empresa es requerido").max(200).optional(),
  contactFirstName: z.string().trim().max(100).optional(),
  contactLastName: z.string().trim().max(100).optional(),
  email: z.string().trim().email("Email inválido").max(200).optional().or(z.literal("")),
  phone: z.string().trim().max(30).optional(),
  dealTitle: z.string().trim().max(200).optional(),
  rut: z.string().trim().max(20).optional(),
  legalName: z.string().trim().max(200).optional(),
  legalRepresentativeName: z.string().trim().max(200).optional(),
  legalRepresentativeRut: z.string().trim().max(20).optional(),
  industry: z.string().trim().max(100).optional(),
  segment: z.string().trim().max(100).optional(),
  website: z.string().trim().url("URL inválida").max(500).optional().or(z.literal("")),
  address: z.string().trim().max(500).optional(),
  roleTitle: z.string().trim().max(100).optional(),
  accountNotes: z.string().trim().max(2000).optional(),
  amount: z.number().min(0).optional(),
  probability: z.number().min(0).max(100).optional(),
  expectedCloseDate: z.string().optional(),
});

export const rejectLeadSchema = z.object({
  reason: z
    .enum(["spot_service", "out_of_scope", "no_budget", "duplicate", "no_response", "other"])
    .default("other"),
  note: z.string().trim().max(5000).optional().nullable(),
  sendEmail: z.boolean().optional().default(false),
  emailTemplateId: z.string().uuid().optional().nullable(),
  emailSubject: z.string().trim().max(500).optional().nullable(),
  emailBody: z.string().trim().max(50000).optional().nullable(),
});

// ── Account ──
export const createAccountSchema = z.object({
  name: z.string().trim().min(1, "Nombre es requerido").max(200),
  type: z.enum(["prospect", "client"]).default("prospect"),
  rut: z.string().trim().max(20).optional().nullable(),
  legalName: z.string().trim().max(200).optional().nullable(),
  legalRepresentativeName: z.string().trim().max(200).optional().nullable(),
  legalRepresentativeRut: z.string().trim().max(20).optional().nullable(),
  industry: z.string().trim().max(100).optional().nullable(),
  segment: z.string().trim().max(100).optional().nullable(),
  status: z
    .enum(["prospect", "client_active", "client_inactive", "active", "inactive"])
    .default("prospect"),
  isActive: z.boolean().default(false),
  website: z.string().trim().url("URL inválida").max(500).optional().nullable().or(z.literal("")),
  address: z.string().trim().max(500).optional().nullable(),
  notes: z.string().trim().max(20000).optional().nullable(),
});

/** Más permisivo para PATCH: website acepta cualquier string, notes más largo */
export const updateAccountSchema = z.object({
  name: z.string().trim().min(1, "Nombre es requerido").max(200).optional(),
  type: z.enum(["prospect", "client"]).optional(),
  rut: z.string().trim().max(20).optional().nullable(),
  legalName: z.string().trim().max(200).optional().nullable(),
  legalRepresentativeName: z.string().trim().max(200).optional().nullable(),
  legalRepresentativeRut: z.string().trim().max(20).optional().nullable(),
  industry: z.string().trim().max(100).optional().nullable(),
  segment: z.string().trim().max(100).optional().nullable(),
  status: z.enum(["prospect", "client_active", "client_inactive", "active", "inactive"]).optional(),
  isActive: z.boolean().optional(),
  website: z.string().trim().max(500).optional().nullable(),
  address: z.string().trim().max(500).optional().nullable(),
  notes: z.string().trim().max(20000).optional().nullable(),
});

// ── Contact ──
export const createContactSchema = z.object({
  accountId: z.string().uuid("accountId inválido"),
  firstName: z.string().trim().min(1, "Nombre es requerido").max(100),
  lastName: z.string().trim().min(1, "Apellido es requerido").max(100),
  email: z.string().trim().email("Email inválido").max(200),
  phone: z.string().trim().max(30).optional().nullable(),
  roleTitle: z.string().trim().max(100).optional().nullable(),
  isPrimary: z.boolean().default(false),
});

export const updateContactSchema = z.object({
  firstName: z.string().trim().min(1, "Nombre es requerido").max(100).optional(),
  lastName: z.string().trim().min(1, "Apellido es requerido").max(100).optional(),
  email: z.string().trim().email("Email inválido").max(200).optional(),
  phone: z.string().trim().max(30).optional().nullable(),
  roleTitle: z.string().trim().max(100).optional().nullable(),
  isPrimary: z.boolean().optional(),
});

// ── Installation ──
export const createInstallationSchema = z.object({
  accountId: z.string().uuid("accountId inválido"),
  name: z.string().trim().min(1, "Nombre es requerido").max(200),
  address: z.string().trim().max(500).optional().nullable(),
  city: z.string().trim().max(100).optional().nullable(),
  commune: z.string().trim().max(100).optional().nullable(),
  lat: z.number().optional().nullable(),
  lng: z.number().optional().nullable(),
  isActive: z.boolean().optional(),
  geoRadiusM: z.number().int().min(10).max(1000).optional(),
  teMontoClp: z.number().min(0).optional(),
  notes: z.string().trim().max(2000).optional().nullable(),
});

export const updateInstallationSchema = z.object({
  name: z.string().trim().min(1, "Nombre es requerido").max(200).optional(),
  address: z.string().trim().max(500).optional().nullable(),
  city: z.string().trim().max(100).optional().nullable(),
  commune: z.string().trim().max(100).optional().nullable(),
  lat: z.number().optional().nullable(),
  lng: z.number().optional().nullable(),
  isActive: z.boolean().optional(),
  geoRadiusM: z.number().int().min(10).max(1000).optional(),
  teMontoClp: z.number().min(0).optional(),
  notes: z.string().trim().max(2000).optional().nullable(),
  nocturnoEnabled: z.boolean().optional(),
  startDate: z.string().optional().nullable(),
  endDate: z.string().optional().nullable(),
  activateAccount: z.boolean().optional(),
});

// ── Deal ──
export const createDealSchema = z.object({
  accountId: z.string().uuid("accountId inválido"),
  title: z.string().trim().max(200).optional(),
  stageId: z.string().uuid("stageId inválido").optional(),
  primaryContactId: z.string().uuid("primaryContactId inválido").optional().nullable(),
  amount: z.number().min(0).default(0),
  probability: z.number().min(0).max(100).default(0),
  expectedCloseDate: z.string().optional(),
});

export const updateDealStageSchema = z.object({
  stageId: z.string().uuid("stageId inválido"),
});

export const linkDealQuoteSchema = z.object({
  quoteId: z.string().uuid("quoteId inválido"),
});

// ── Pipeline ──
export const createPipelineStageSchema = z.object({
  name: z.string().trim().min(1, "Nombre es requerido").max(100),
  order: z.number().int().min(0).default(1),
  color: z.string().max(20).optional().nullable(),
  isClosedWon: z.boolean().default(false),
  isClosedLost: z.boolean().default(false),
});

// ── Email Template ──
export const createEmailTemplateSchema = z.object({
  name: z.string().trim().min(1, "Nombre es requerido").max(200),
  subject: z.string().trim().min(1, "Asunto es requerido").max(500),
  body: z.string().trim().min(1, "Cuerpo es requerido").max(10000),
  scope: z.enum(["global", "stage", "deal"]).default("global"),
  stageId: z.string().uuid().optional().nullable(),
});

// ── Gmail Send ──
export const sendEmailSchema = z.object({
  to: z.string().trim().email("Email destinatario inválido"),
  cc: z.array(z.string().email()).default([]),
  bcc: z.array(z.string().email()).default([]),
  subject: z.string().trim().min(1, "Asunto es requerido").max(500),
  html: z.string().max(50000).optional(),
  text: z.string().max(50000).optional(),
  dealId: z.string().uuid().optional(),
  accountId: z.string().uuid().optional(),
  contactId: z.string().uuid().optional(),
});

// ── Custom Field ──
export const createCustomFieldSchema = z.object({
  name: z.string().trim().min(1, "Nombre es requerido").max(100),
  entityType: z.string().trim().min(1, "Tipo de entidad es requerido").max(50),
  type: z.enum(["text", "number", "date", "select", "select_multiple", "boolean", "url"]),
  options: z.any().optional(),
  urlLabel: z.string().trim().max(100).optional(),
});
