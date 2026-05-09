/**
 * Billing Document Config Service
 *
 * Lee y persiste los campos de configuración del documento de cobro
 * en TenantDteConfig (plantillas de email Proforma/Estado de Pago,
 * footer legal, override de colores de marca, plantilla del código
 * de verificación).
 */

import { prisma } from "@/lib/prisma";
import { getTenantCompanyConfig } from "@/lib/tenant-config";
import type { TenantBillingDocConfigInput } from "@/lib/validations/billing-doc";

export interface BillingDocConfigDto {
  proformaEmailSubject: string | null;
  proformaEmailIntro: string | null;
  estadoPagoEmailSubject: string | null;
  estadoPagoEmailIntro: string | null;
  estadoPagoFooterLegal: string | null;
  billingDocBrandPrimary: string | null;
  billingDocBrandSecondary: string | null;
  verificationCodeTemplate: string;
}

const DEFAULT_VERIFICATION_TEMPLATE = "EP-{{year}}{{month}}-{{folio}}";

const EMPTY_CONFIG: BillingDocConfigDto = {
  proformaEmailSubject: null,
  proformaEmailIntro: null,
  estadoPagoEmailSubject: null,
  estadoPagoEmailIntro: null,
  estadoPagoFooterLegal: null,
  billingDocBrandPrimary: null,
  billingDocBrandSecondary: null,
  verificationCodeTemplate: DEFAULT_VERIFICATION_TEMPLATE,
};

export async function getBillingDocConfig(
  tenantId: string,
): Promise<BillingDocConfigDto> {
  const row = await prisma.tenantDteConfig.findUnique({
    where: { tenantId },
    select: {
      proformaEmailSubject: true,
      proformaEmailIntro: true,
      estadoPagoEmailSubject: true,
      estadoPagoEmailIntro: true,
      estadoPagoFooterLegal: true,
      billingDocBrandPrimary: true,
      billingDocBrandSecondary: true,
      verificationCodeTemplate: true,
    },
  });
  if (!row) return EMPTY_CONFIG;
  return {
    proformaEmailSubject: row.proformaEmailSubject,
    proformaEmailIntro: row.proformaEmailIntro,
    estadoPagoEmailSubject: row.estadoPagoEmailSubject,
    estadoPagoEmailIntro: row.estadoPagoEmailIntro,
    estadoPagoFooterLegal: row.estadoPagoFooterLegal,
    billingDocBrandPrimary: row.billingDocBrandPrimary,
    billingDocBrandSecondary: row.billingDocBrandSecondary,
    verificationCodeTemplate:
      row.verificationCodeTemplate || DEFAULT_VERIFICATION_TEMPLATE,
  };
}

/**
 * Upsert: si no existe TenantDteConfig para este tenant, lo crea con
 * defaults mínimos (igual que cuando se inicializa la pantalla del DTE).
 */
export async function updateBillingDocConfig(
  tenantId: string,
  input: TenantBillingDocConfigInput,
): Promise<BillingDocConfigDto> {
  const data = {
    ...(input.proformaEmailSubject !== undefined
      ? { proformaEmailSubject: input.proformaEmailSubject ?? null }
      : {}),
    ...(input.proformaEmailIntro !== undefined
      ? { proformaEmailIntro: input.proformaEmailIntro ?? null }
      : {}),
    ...(input.estadoPagoEmailSubject !== undefined
      ? { estadoPagoEmailSubject: input.estadoPagoEmailSubject ?? null }
      : {}),
    ...(input.estadoPagoEmailIntro !== undefined
      ? { estadoPagoEmailIntro: input.estadoPagoEmailIntro ?? null }
      : {}),
    ...(input.estadoPagoFooterLegal !== undefined
      ? { estadoPagoFooterLegal: input.estadoPagoFooterLegal ?? null }
      : {}),
    ...(input.billingDocBrandPrimary !== undefined
      ? { billingDocBrandPrimary: input.billingDocBrandPrimary ?? null }
      : {}),
    ...(input.billingDocBrandSecondary !== undefined
      ? { billingDocBrandSecondary: input.billingDocBrandSecondary ?? null }
      : {}),
    ...(input.verificationCodeTemplate !== undefined
      ? { verificationCodeTemplate: input.verificationCodeTemplate }
      : {}),
  };

  await prisma.tenantDteConfig.upsert({
    where: { tenantId },
    update: data,
    create: { tenantId, ...data },
  });

  return getBillingDocConfig(tenantId);
}

/**
 * Resuelve los colores de marca para el documento de cobro con cascade:
 *   1. TenantDteConfig.billingDocBrandPrimary/Secondary (override fino)
 *   2. Setting empresa.brandingPrimaryColor / SecondaryColor
 *   3. Fallbacks visuales (#0D1117 / #0066FF)
 */
export async function resolveBrandColors(
  tenantId: string,
): Promise<{ primary: string; secondary: string }> {
  const cfg = await getBillingDocConfig(tenantId);
  if (cfg.billingDocBrandPrimary && cfg.billingDocBrandSecondary) {
    return {
      primary: cfg.billingDocBrandPrimary,
      secondary: cfg.billingDocBrandSecondary,
    };
  }
  const company = await getTenantCompanyConfig(tenantId);
  return {
    primary:
      cfg.billingDocBrandPrimary ?? company.brandingPrimaryColor ?? "#0D1117",
    secondary:
      cfg.billingDocBrandSecondary ??
      company.brandingSecondaryColor ??
      "#0066FF",
  };
}
