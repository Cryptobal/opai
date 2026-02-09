-- CreateTable
CREATE TABLE "crm"."email_templates" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "tenant_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "scope" TEXT NOT NULL DEFAULT 'global',
    "stage_id" UUID,
    "created_by" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "email_templates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_crm_email_templates_tenant" ON "crm"."email_templates"("tenant_id");

-- CreateIndex
CREATE INDEX "idx_crm_email_templates_scope" ON "crm"."email_templates"("scope");

-- CreateIndex
CREATE INDEX "idx_crm_email_templates_stage" ON "crm"."email_templates"("stage_id");
