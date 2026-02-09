-- Migración: Campos para importación desde Soho CRM
-- 1. CrmAccount: legalName, legalRepresentativeName, legalRepresentativeRut
-- 2. CrmDeal: proposalLink, proposalSentAt, dealType, notes, y campos adicionales de instalación

-- CrmAccount: Razón social y representante legal
ALTER TABLE "crm"."accounts" ADD COLUMN "legal_name" TEXT;
ALTER TABLE "crm"."accounts" ADD COLUMN "legal_representative_name" TEXT;
ALTER TABLE "crm"."accounts" ADD COLUMN "legal_representative_rut" TEXT;

-- CrmDeal: Link propuesta y campos adicionales de negocios
ALTER TABLE "crm"."deals" ADD COLUMN "proposal_link" TEXT;
ALTER TABLE "crm"."deals" ADD COLUMN "proposal_sent_at" DATE;
ALTER TABLE "crm"."deals" ADD COLUMN "deal_type" TEXT;
ALTER TABLE "crm"."deals" ADD COLUMN "notes" TEXT;
ALTER TABLE "crm"."deals" ADD COLUMN "drive_folder_link" TEXT;
ALTER TABLE "crm"."deals" ADD COLUMN "installation_name" TEXT;
ALTER TABLE "crm"."deals" ADD COLUMN "technical_visit_date" DATE;
ALTER TABLE "crm"."deals" ADD COLUMN "service" TEXT;
ALTER TABLE "crm"."deals" ADD COLUMN "street" TEXT;
ALTER TABLE "crm"."deals" ADD COLUMN "address" TEXT;
ALTER TABLE "crm"."deals" ADD COLUMN "city" TEXT;
ALTER TABLE "crm"."deals" ADD COLUMN "commune" TEXT;
ALTER TABLE "crm"."deals" ADD COLUMN "lat" DOUBLE PRECISION;
ALTER TABLE "crm"."deals" ADD COLUMN "lng" DOUBLE PRECISION;
ALTER TABLE "crm"."deals" ADD COLUMN "installation_website" TEXT;
