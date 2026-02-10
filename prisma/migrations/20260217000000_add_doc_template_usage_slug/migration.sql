-- Add usage_slug to doc_templates (for WhatsApp system templates: proposal_sent, followup_first, etc.)
ALTER TABLE "docs"."doc_templates" ADD COLUMN IF NOT EXISTS "usage_slug" TEXT;

CREATE UNIQUE INDEX "uq_doc_template_tenant_usage_slug" ON "docs"."doc_templates" ("tenant_id", "usage_slug");

CREATE INDEX "idx_doc_templates_tenant_module" ON "docs"."doc_templates" ("tenant_id", "module");
