-- CreateTable
CREATE TABLE "crm"."company_presentations" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "tenant_id" UUID NOT NULL,
    "contact_id" UUID NOT NULL,
    "installation_id" UUID,
    "template_id" UUID,
    "status" VARCHAR(20) NOT NULL DEFAULT 'sent',
    "sent_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sent_by_id" UUID NOT NULL,
    "first_viewed_at" TIMESTAMPTZ(6),
    "view_count" INTEGER NOT NULL DEFAULT 0,
    "deactivated_at" TIMESTAMPTZ(6),
    "deactivated_by" VARCHAR(30),
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "company_presentations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_crm_company_presentation_tenant" ON "crm"."company_presentations"("tenant_id");

-- CreateIndex
CREATE INDEX "idx_crm_company_presentation_contact" ON "crm"."company_presentations"("contact_id");

-- CreateIndex
CREATE INDEX "idx_crm_company_presentation_status" ON "crm"."company_presentations"("status");

-- AddForeignKey
ALTER TABLE "crm"."company_presentations" ADD CONSTRAINT "company_presentations_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "crm"."contacts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm"."company_presentations" ADD CONSTRAINT "company_presentations_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "cpq"."proposal_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Seed: Insert company-presentation template (if not exists)
INSERT INTO "cpq"."proposal_templates" ("id", "tenant_id", "name", "slug", "description", "sections", "is_default", "active")
SELECT
  uuid_generate_v4(),
  (SELECT id FROM public.tenants LIMIT 1),
  'Presentación de Empresa',
  'company-presentation',
  'Template de presentación institucional sin evaluación económica. Se usa para onboarding de prospectos.',
  '{
    "header": true,
    "companyIntro": true,
    "services": true,
    "certifications": true,
    "clients": true,
    "differentiators": true,
    "technology": true,
    "regulations": true,
    "contact": true,
    "economicEvaluation": false,
    "terms": false,
    "costBreakdown": false
  }'::jsonb,
  false,
  true
WHERE NOT EXISTS (
  SELECT 1 FROM "cpq"."proposal_templates" WHERE "slug" = 'company-presentation'
);
