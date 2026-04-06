/**
 * Tenant Provisioning — Crea un nuevo tenant con toda su configuración inicial
 *
 * Uso:
 * - Desde script CLI: scripts/create-tenant.ts
 * - Futuro: desde API route /api/admin/tenants (superadmin)
 */

import { prisma } from "@/lib/prisma";
import * as bcrypt from "bcryptjs";
import { PLAN_MODULES, type TenantModuleKey } from "@/lib/tenant-modules";

export interface CreateTenantInput {
  // Empresa
  name: string; // "Securitas Chile SpA"
  slug: string; // "securitas-cl" (lowercase, solo letras, números, guiones)
  companyRut?: string; // "76.111.222-3"

  // Admin owner
  ownerName: string; // "Juan Pérez"
  ownerEmail: string; // "juan@securitas.cl"
  ownerPassword: string; // Se hashea con bcrypt

  // Plan
  plan: "free" | "starter" | "profesional" | "enterprise" | "trial" | "essential" | "professional";
  trialDays?: number; // Default: 30
}

export interface CreateTenantResult {
  tenant: { id: string; slug: string; name: string };
  admin: { id: string; email: string };
  plan: { plan: string; trialEndsAt: Date | null };
  modulesEnabled: string[];
}

export async function provisionTenant(
  input: CreateTenantInput,
): Promise<CreateTenantResult> {
  const {
    name,
    slug,
    companyRut,
    ownerName,
    ownerEmail,
    ownerPassword,
    plan,
    trialDays = 30,
  } = input;

  // Normalize legacy plan names
  const planSlug =
    plan === 'trial' ? 'free' :
    plan === 'essential' ? 'starter' :
    plan === 'professional' ? 'profesional' :
    plan;

  // ── Validaciones ──

  if (!slug.match(/^[a-z0-9-]+$/)) {
    throw new Error(
      `Slug inválido: "${slug}". Solo letras minúsculas, números y guiones.`,
    );
  }

  const existingTenant = await prisma.tenant.findUnique({
    where: { slug },
  });
  if (existingTenant) {
    throw new Error(`Tenant con slug "${slug}" ya existe.`);
  }

  const existingEmail = await prisma.admin.findFirst({
    where: { email: ownerEmail.toLowerCase() },
  });
  if (existingEmail) {
    throw new Error(
      `Email "${ownerEmail}" ya está registrado en otro tenant.`,
    );
  }

  // ── Hash password ──
  const hashedPassword = await bcrypt.hash(ownerPassword, 12);

  // ── Crear en transacción ──
  const result = await prisma.$transaction(async (tx) => {
    // Leer límites desde PlanCatalog en vez de hardcodear
    const planCatalog = await tx.planCatalog.findUnique({ where: { slug: planSlug } });

    // Fallback a defaults si el catálogo no existe aún
    const maxGuards = planCatalog?.maxGuards ??
      (planSlug === "enterprise" ? 9999 : planSlug === "profesional" ? 500 : planSlug === "starter" ? 200 : 50);
    const maxAdmins = planCatalog?.maxAdmins ??
      (planSlug === "enterprise" ? 50 : planSlug === "profesional" ? 10 : planSlug === "starter" ? 5 : 3);
    const maxStorageMb = planCatalog?.maxStorageMb ??
      (planSlug === "enterprise" ? 10000 : planSlug === "profesional" ? 5000 : 1000);

    // 1. Tenant
    const tenant = await tx.tenant.create({
      data: { name, slug, active: true },
    });

    // 2. Admin (owner)
    const admin = await tx.admin.create({
      data: {
        tenantId: tenant.id,
        email: ownerEmail.toLowerCase(),
        name: ownerName,
        password: hashedPassword,
        role: "owner",
        status: "active",
      },
    });

    // 3. Plan
    const tenantPlan = await tx.tenantPlan.create({
      data: {
        tenantId: tenant.id,
        plan: planSlug,
        billingStatus: "trial",
        trialEndsAt: new Date(Date.now() + trialDays * 24 * 60 * 60 * 1000),
        maxGuards,
        maxAdmins,
        maxStorageMb,
      },
    });

    // 4. Módulos según plan (prefer catalog, fallback to PLAN_MODULES)
    const catalogModules = planCatalog?.includedModules as string[] | undefined;
    const modules: string[] = (catalogModules && catalogModules.length > 0)
      ? catalogModules
      : (PLAN_MODULES[planSlug] || PLAN_MODULES.free) as string[];

    for (const mod of modules) {
      await tx.tenantModule.create({
        data: {
          tenantId: tenant.id,
          module: mod,
          enabled: true,
        },
      });
    }

    // 5. Settings de empresa (key format: empresa:<tenantId>:<settingKey> for uniqueness)
    const settings: { key: string; value: string }[] = [
      { key: "empresa.companyName", value: name },
      { key: "empresa.razonSocial", value: name },
      { key: "empresa.branding.appName", value: "OPAI" },
      { key: "empresa.branding.primaryColor", value: "#0056E0" },
      { key: "empresa.branding.secondaryColor", value: "#1DB990" },
    ];

    if (companyRut) {
      settings.push({ key: "empresa.rut", value: companyRut });
    }

    for (const s of settings) {
      await tx.setting.create({
        data: {
          tenantId: tenant.id,
          key: `empresa:${tenant.id}:${s.key}`,
          value: s.value,
          type: "string",
          category: "empresa",
        },
      });
    }

    return {
      tenant: { id: tenant.id, slug: tenant.slug, name: tenant.name },
      admin: { id: admin.id, email: admin.email },
      plan: {
        plan: tenantPlan.plan,
        trialEndsAt: tenantPlan.trialEndsAt,
      },
      modulesEnabled: modules,
    };
  }, { timeout: 30000 });

  console.log(`[PROVISIONING] Tenant "${slug}" created successfully:`, {
    tenantId: result.tenant.id,
    admin: result.admin.email,
    plan: result.plan.plan,
    modules: result.modulesEnabled.length,
  });

  return result;
}
