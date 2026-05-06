/**
 * Service para CRUD del catálogo per-tenant de empresas de factoring
 * (Bloque 3 factoring v3).
 *
 * Multi-tenant: TODA query filtra por tenantId. RUT único per-tenant
 * (no entre tenants — distintos tenants pueden tener el mismo factoring).
 */

import { prisma } from "@/lib/prisma";
import {
  cleanRut,
  formatRut,
  validateRut,
} from "../shared/validators/rut.validator";

export interface FactoringCompanyInput {
  rut: string;
  razonSocial: string;
  direccion?: string | null;
  comuna?: string | null;
  ciudad?: string | null;
  email?: string | null;
  contactName?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
  defaultAdvanceRate?: number | null;
  defaultInterestRate?: number | null;
  defaultCommissionPct?: number | null;
  notes?: string | null;
}

export interface ListFactoringCompaniesOptions {
  includeInactive?: boolean;
  search?: string;
}

/**
 * Normaliza un input para inserción/update: limpia RUT, recorta strings,
 * valida RUT.
 */
function normalizeInput(input: FactoringCompanyInput): {
  ok: true;
  data: FactoringCompanyInput & { rut: string };
} | { ok: false; error: string } {
  const cleanedRut = cleanRut(input.rut ?? "");
  const v = validateRut(cleanedRut);
  if (!v.valid) {
    return { ok: false, error: `RUT inválido: ${v.error}` };
  }
  if (!input.razonSocial || input.razonSocial.trim().length < 2) {
    return { ok: false, error: "Razón social requerida (mínimo 2 caracteres)" };
  }
  return {
    ok: true,
    data: {
      ...input,
      rut: cleanedRut,
      razonSocial: input.razonSocial.trim(),
    },
  };
}

/**
 * Lista empresas de factoring del tenant. Por defecto solo activas.
 */
export async function listFactoringCompanies(
  tenantId: string,
  options: ListFactoringCompaniesOptions = {},
) {
  const where: Record<string, unknown> = { tenantId };
  if (!options.includeInactive) where.isActive = true;
  if (options.search && options.search.trim().length > 0) {
    const term = options.search.trim();
    where.OR = [
      { razonSocial: { contains: term, mode: "insensitive" } },
      { rut: { contains: cleanRut(term), mode: "insensitive" } },
    ];
  }

  const companies = await prisma.financeFactoringCompany.findMany({
    where,
    orderBy: [{ isActive: "desc" }, { razonSocial: "asc" }],
  });

  return companies.map((c) => ({
    ...c,
    rutFormatted: formatRut(c.rut),
  }));
}

/**
 * Obtiene una empresa de factoring por id, validando tenant.
 */
export async function getFactoringCompany(tenantId: string, id: string) {
  const company = await prisma.financeFactoringCompany.findFirst({
    where: { id, tenantId },
  });
  if (!company) return null;
  return { ...company, rutFormatted: formatRut(company.rut) };
}

/**
 * Crea una empresa de factoring para el tenant.
 * Falla si ya existe una con el mismo RUT (constraint unique compuesto).
 */
export async function createFactoringCompany(
  tenantId: string,
  input: FactoringCompanyInput,
) {
  const norm = normalizeInput(input);
  if (!norm.ok) throw new Error(norm.error);

  // Pre-check de duplicado para dar mensaje claro vs error de constraint.
  const existing = await prisma.financeFactoringCompany.findFirst({
    where: { tenantId, rut: norm.data.rut },
    select: { id: true, isActive: true },
  });
  if (existing) {
    throw new Error(
      `Ya existe una empresa de factoring con el RUT ${formatRut(norm.data.rut)}` +
        (existing.isActive ? "." : " (inactiva — reactivá la existente)."),
    );
  }

  const created = await prisma.financeFactoringCompany.create({
    data: {
      tenantId,
      rut: norm.data.rut,
      razonSocial: norm.data.razonSocial,
      direccion: norm.data.direccion ?? null,
      comuna: norm.data.comuna ?? null,
      ciudad: norm.data.ciudad ?? null,
      email: norm.data.email ?? null,
      contactName: norm.data.contactName ?? null,
      contactEmail: norm.data.contactEmail ?? null,
      contactPhone: norm.data.contactPhone ?? null,
      defaultAdvanceRate: norm.data.defaultAdvanceRate ?? null,
      defaultInterestRate: norm.data.defaultInterestRate ?? null,
      defaultCommissionPct: norm.data.defaultCommissionPct ?? null,
      notes: norm.data.notes ?? null,
    },
  });
  return { ...created, rutFormatted: formatRut(created.rut) };
}

/**
 * Actualiza una empresa de factoring del tenant. Si se cambia el RUT,
 * valida unicidad de nuevo.
 */
export async function updateFactoringCompany(
  tenantId: string,
  id: string,
  input: Partial<FactoringCompanyInput>,
) {
  const current = await getFactoringCompany(tenantId, id);
  if (!current) {
    throw new Error("Empresa de factoring no encontrada");
  }

  const merged: FactoringCompanyInput = {
    rut: input.rut ?? current.rut,
    razonSocial: input.razonSocial ?? current.razonSocial,
    direccion: input.direccion ?? current.direccion,
    comuna: input.comuna ?? current.comuna,
    ciudad: input.ciudad ?? current.ciudad,
    email: input.email ?? current.email,
    contactName: input.contactName ?? current.contactName,
    contactEmail: input.contactEmail ?? current.contactEmail,
    contactPhone: input.contactPhone ?? current.contactPhone,
    defaultAdvanceRate:
      input.defaultAdvanceRate ?? Number(current.defaultAdvanceRate ?? 0),
    defaultInterestRate:
      input.defaultInterestRate ?? Number(current.defaultInterestRate ?? 0),
    defaultCommissionPct:
      input.defaultCommissionPct ?? Number(current.defaultCommissionPct ?? 0),
    notes: input.notes ?? current.notes,
  };

  const norm = normalizeInput(merged);
  if (!norm.ok) throw new Error(norm.error);

  // Si cambió el RUT, validar unicidad contra otras empresas del tenant.
  if (norm.data.rut !== current.rut) {
    const dup = await prisma.financeFactoringCompany.findFirst({
      where: { tenantId, rut: norm.data.rut, NOT: { id } },
      select: { id: true },
    });
    if (dup) {
      throw new Error(
        `Otra empresa de factoring ya tiene el RUT ${formatRut(norm.data.rut)}.`,
      );
    }
  }

  const updated = await prisma.financeFactoringCompany.update({
    where: { id },
    data: {
      rut: norm.data.rut,
      razonSocial: norm.data.razonSocial,
      direccion: norm.data.direccion ?? null,
      comuna: norm.data.comuna ?? null,
      ciudad: norm.data.ciudad ?? null,
      email: norm.data.email ?? null,
      contactName: norm.data.contactName ?? null,
      contactEmail: norm.data.contactEmail ?? null,
      contactPhone: norm.data.contactPhone ?? null,
      defaultAdvanceRate: norm.data.defaultAdvanceRate ?? null,
      defaultInterestRate: norm.data.defaultInterestRate ?? null,
      defaultCommissionPct: norm.data.defaultCommissionPct ?? null,
      notes: norm.data.notes ?? null,
    },
  });
  return { ...updated, rutFormatted: formatRut(updated.rut) };
}

/**
 * Soft delete: marca la empresa como inactiva. NO la borra para
 * preservar la integridad referencial con FactoringOperation.
 */
export async function deactivateFactoringCompany(
  tenantId: string,
  id: string,
) {
  const current = await getFactoringCompany(tenantId, id);
  if (!current) {
    throw new Error("Empresa de factoring no encontrada");
  }
  const updated = await prisma.financeFactoringCompany.update({
    where: { id },
    data: { isActive: false },
  });
  return { ...updated, rutFormatted: formatRut(updated.rut) };
}

/**
 * Reactivar una empresa previamente desactivada.
 */
export async function reactivateFactoringCompany(
  tenantId: string,
  id: string,
) {
  const current = await getFactoringCompany(tenantId, id);
  if (!current) {
    throw new Error("Empresa de factoring no encontrada");
  }
  const updated = await prisma.financeFactoringCompany.update({
    where: { id },
    data: { isActive: true },
  });
  return { ...updated, rutFormatted: formatRut(updated.rut) };
}
