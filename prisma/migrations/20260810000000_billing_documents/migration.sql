-- ──────────────────────────────────────────────────────────────────────────
--  Documento de Cobro: Proforma / Estado de Pago / Pre-factura.
--
--  El borrador de DTE (`finance_dtes` con `sii_status = 'DRAFT'`) hace de
--  documento de cobro. Esta migración agrega:
--    1. Estado de proforma paralelo a sii_status (no toca el flow SII).
--    2. Layout preferido por cliente (CrmAccount.layout_documento_cobro).
--    3. N° de Orden / Contrato del cliente (CrmAccount.numero_orden_contrato).
--    4. Configuración de plantillas de email branded en TenantDteConfig.
--    5. Tabla TenantBillingSigner (firmantes parametrizables 1-3).
--    6. Metadata por línea para Estado de Pago (días, factor zona, fechas).
-- ──────────────────────────────────────────────────────────────────────────

-- 1. Enum FinanceProformaStatus (independiente de sii_status)
CREATE TYPE "finance"."FinanceProformaStatus" AS ENUM (
  'NONE',
  'SENT',
  'VIEWED',
  'APPROVED',
  'REJECTED'
);

-- 2. Enum BillingDocumentLayout (qué layout PDF prefiere el cliente)
CREATE TYPE "crm"."BillingDocumentLayout" AS ENUM (
  'DTE_PREVIEW',
  'PROFORMA',
  'ESTADO_DE_PAGO'
);

-- 3. Columnas nuevas en finance.finance_dtes
ALTER TABLE "finance"."finance_dtes"
  ADD COLUMN "proforma_status"        "finance"."FinanceProformaStatus" NOT NULL DEFAULT 'NONE',
  ADD COLUMN "proforma_sent_at"       TIMESTAMP(6) WITH TIME ZONE,
  ADD COLUMN "proforma_sent_count"    INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "proforma_last_variant"  TEXT,
  ADD COLUMN "proforma_last_recipient" TEXT;

CREATE INDEX "idx_finance_dte_proforma_status"
  ON "finance"."finance_dtes" ("tenant_id", "proforma_status");

-- 4. Metadata por línea para Estado de Pago.
--    Shape: { dias?: number, factorZona?: number, fechaEjecucion?: "YYYY-MM-DD",
--             fechaReporteTrabajo?: "YYYY-MM-DD", fechaInformeTecnico?: "YYYY-MM-DD" }
ALTER TABLE "finance"."finance_dte_lines"
  ADD COLUMN "estado_pago_meta" JSONB;

-- 5. Columnas nuevas en crm.accounts (cliente)
ALTER TABLE "crm"."accounts"
  ADD COLUMN "numero_orden_contrato"   TEXT,
  ADD COLUMN "contacto_estado_pago_id" UUID,
  ADD COLUMN "layout_documento_cobro"  "crm"."BillingDocumentLayout" NOT NULL DEFAULT 'DTE_PREVIEW';

ALTER TABLE "crm"."accounts"
  ADD CONSTRAINT "accounts_contacto_estado_pago_id_fkey"
  FOREIGN KEY ("contacto_estado_pago_id") REFERENCES "crm"."contacts"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "idx_crm_accounts_contacto_estado_pago"
  ON "crm"."accounts" ("contacto_estado_pago_id")
  WHERE "contacto_estado_pago_id" IS NOT NULL;

-- 6. Columnas nuevas en public.tenant_dte_configs
ALTER TABLE "public"."tenant_dte_configs"
  ADD COLUMN "proforma_email_subject"      TEXT,
  ADD COLUMN "proforma_email_intro"        TEXT,
  ADD COLUMN "estado_pago_email_subject"   TEXT,
  ADD COLUMN "estado_pago_email_intro"     TEXT,
  ADD COLUMN "estado_pago_footer_legal"    TEXT,
  ADD COLUMN "billing_doc_brand_primary"   TEXT,
  ADD COLUMN "billing_doc_brand_secondary" TEXT,
  ADD COLUMN "verification_code_template"  TEXT NOT NULL DEFAULT 'EP-{{year}}{{month}}-{{folio}}';

-- 7. Tabla TenantBillingSigner — firmantes parametrizables (1-3 por tenant).
CREATE TABLE "public"."tenant_billing_signers" (
  "id"                    TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "tenant_id"             TEXT NOT NULL,
  "name"                  TEXT NOT NULL,
  "role"                  TEXT NOT NULL,
  "signature_storage_key" TEXT,
  "display_order"         INTEGER NOT NULL DEFAULT 0,
  "is_active"             BOOLEAN NOT NULL DEFAULT true,
  "created_at"            TIMESTAMP(6) WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"            TIMESTAMP(6) WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "tenant_billing_signers_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "idx_tenant_billing_signers_tenant"
  ON "public"."tenant_billing_signers" ("tenant_id", "is_active", "display_order");

-- ──────────────────────────────────────────────────────────────────────────
-- Backfill defensivo: existing finance_dtes ya tienen DEFAULT 'NONE'.
-- Existing accounts ya tienen DEFAULT 'DTE_PREVIEW'. No requiere UPDATE.
-- ──────────────────────────────────────────────────────────────────────────
