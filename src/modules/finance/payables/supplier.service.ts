/**
 * Supplier Service
 * CRUD for suppliers (proveedores)
 */

import { prisma } from "@/lib/prisma";
import { validateRut } from "../shared/validators/rut.validator";

/**
 * List suppliers
 */
export async function listSuppliers(
  tenantId: string,
  filters?: { search?: string; isActive?: boolean; page?: number; pageSize?: number }
) {
  const page = filters?.page ?? 1;
  const pageSize = filters?.pageSize ?? 50;
  const skip = (page - 1) * pageSize;

  const where: any = { tenantId };
  if (filters?.isActive !== undefined) where.isActive = filters.isActive;
  if (filters?.search) {
    where.OR = [
      { name: { contains: filters.search, mode: "insensitive" } },
      { rut: { contains: filters.search } },
      { tradeName: { contains: filters.search, mode: "insensitive" } },
    ];
  }

  const [suppliers, total] = await Promise.all([
    prisma.financeSupplier.findMany({
      where,
      orderBy: { name: "asc" },
      skip,
      take: pageSize,
    }),
    prisma.financeSupplier.count({ where }),
  ]);

  return { suppliers, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
}

/**
 * Get a single supplier
 */
export async function getSupplier(tenantId: string, supplierId: string) {
  const supplier = await prisma.financeSupplier.findFirst({
    where: { id: supplierId, tenantId },
  });
  if (!supplier) throw new Error("Proveedor no encontrado");
  return supplier;
}

/**
 * Create a new supplier
 */
export async function createSupplier(
  tenantId: string,
  data: {
    rut: string;
    name: string;
    tradeName?: string;
    address?: string;
    commune?: string;
    city?: string;
    email?: string;
    phone?: string;
    contactName?: string;
    paymentTermDays?: number;
    accountPayableId?: string;
    accountExpenseId?: string;
  }
) {
  // Validate RUT
  const rutValidation = validateRut(data.rut);
  if (!rutValidation.valid) {
    throw new Error(`RUT invalido: ${rutValidation.error}`);
  }

  return prisma.financeSupplier.create({
    data: {
      tenantId,
      rut: data.rut,
      name: data.name,
      tradeName: data.tradeName ?? null,
      address: data.address ?? null,
      commune: data.commune ?? null,
      city: data.city ?? null,
      email: data.email ?? null,
      phone: data.phone ?? null,
      contactName: data.contactName ?? null,
      paymentTermDays: data.paymentTermDays ?? 30,
      accountPayableId: data.accountPayableId ?? null,
      accountExpenseId: data.accountExpenseId ?? null,
      isActive: true,
    },
  });
}

/**
 * Update a supplier
 */
export async function updateSupplier(
  tenantId: string,
  supplierId: string,
  data: Partial<{
    name: string;
    tradeName: string;
    address: string;
    commune: string;
    city: string;
    email: string;
    phone: string;
    contactName: string;
    paymentTermDays: number;
    accountPayableId: string;
    accountExpenseId: string;
    isActive: boolean;
  }>
) {
  const supplier = await prisma.financeSupplier.findFirst({
    where: { id: supplierId, tenantId },
  });
  if (!supplier) throw new Error("Proveedor no encontrado");

  return prisma.financeSupplier.update({
    where: { id: supplierId },
    data,
  });
}
