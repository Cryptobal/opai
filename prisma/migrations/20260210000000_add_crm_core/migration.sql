-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "crm";

-- CreateTable
CREATE TABLE "crm"."leads" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "tenant_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "source" TEXT,
    "name" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "company_name" TEXT,
    "notes" TEXT,
    "approved_at" TIMESTAMPTZ(6),
    "approved_by" TEXT,
    "converted_account_id" UUID,
    "converted_contact_id" UUID,
    "converted_deal_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "leads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crm"."accounts" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "tenant_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "rut" TEXT,
    "industry" TEXT,
    "size" TEXT,
    "segment" TEXT,
    "owner_id" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "website" TEXT,
    "address" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crm"."contacts" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "tenant_id" TEXT NOT NULL,
    "account_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "role_title" TEXT,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "contacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crm"."pipeline_stages" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "tenant_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "color" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "is_closed_won" BOOLEAN NOT NULL DEFAULT false,
    "is_closed_lost" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "pipeline_stages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crm"."deals" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "tenant_id" TEXT NOT NULL,
    "account_id" UUID NOT NULL,
    "primary_contact_id" UUID,
    "title" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "stage_id" UUID NOT NULL,
    "probability" INTEGER NOT NULL DEFAULT 0,
    "expected_close_date" DATE,
    "status" TEXT NOT NULL DEFAULT 'open',
    "lost_reason" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "deals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crm"."deal_stage_history" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "tenant_id" TEXT NOT NULL,
    "deal_id" UUID NOT NULL,
    "from_stage_id" UUID,
    "to_stage_id" UUID NOT NULL,
    "changed_by" TEXT,
    "changed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "deal_stage_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crm"."deal_quotes" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "tenant_id" TEXT NOT NULL,
    "deal_id" UUID NOT NULL,
    "quote_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "deal_quotes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crm"."tasks" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "tenant_id" TEXT NOT NULL,
    "deal_id" UUID,
    "lead_id" UUID,
    "title" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "type" TEXT NOT NULL DEFAULT 'followup',
    "due_at" TIMESTAMPTZ(6),
    "assigned_to" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crm"."email_accounts" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "tenant_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "access_token_encrypted" TEXT,
    "refresh_token_encrypted" TEXT,
    "token_expires_at" TIMESTAMPTZ(6),
    "status" TEXT NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "email_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crm"."email_threads" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "tenant_id" TEXT NOT NULL,
    "account_id" UUID,
    "contact_id" UUID,
    "deal_id" UUID,
    "subject" TEXT NOT NULL,
    "last_message_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "email_threads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crm"."email_messages" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "tenant_id" TEXT NOT NULL,
    "thread_id" UUID NOT NULL,
    "provider_message_id" TEXT,
    "direction" TEXT NOT NULL DEFAULT 'out',
    "from_email" TEXT NOT NULL,
    "to_emails" TEXT[],
    "cc_emails" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "bcc_emails" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "subject" TEXT NOT NULL,
    "html_body" TEXT,
    "text_body" TEXT,
    "sent_at" TIMESTAMPTZ(6),
    "received_at" TIMESTAMPTZ(6),
    "created_by" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crm"."files" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "tenant_id" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "storage_provider" TEXT NOT NULL,
    "storage_key" TEXT NOT NULL,
    "created_by" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "files_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crm"."file_links" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "tenant_id" TEXT NOT NULL,
    "file_id" UUID NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "file_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crm"."custom_fields" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "tenant_id" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "options" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "custom_fields_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crm"."custom_field_values" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "tenant_id" TEXT NOT NULL,
    "field_id" UUID NOT NULL,
    "entity_id" TEXT NOT NULL,
    "value" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "custom_field_values_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crm"."history_logs" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "tenant_id" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "details" JSONB,
    "created_by" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "history_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_crm_leads_tenant" ON "crm"."leads"("tenant_id");

-- CreateIndex
CREATE INDEX "idx_crm_leads_status" ON "crm"."leads"("status");

-- CreateIndex
CREATE INDEX "idx_crm_leads_created_desc" ON "crm"."leads"("created_at" DESC);

-- CreateIndex
CREATE INDEX "idx_crm_accounts_tenant" ON "crm"."accounts"("tenant_id");

-- CreateIndex
CREATE INDEX "idx_crm_accounts_status" ON "crm"."accounts"("status");

-- CreateIndex
CREATE INDEX "idx_crm_accounts_created_desc" ON "crm"."accounts"("created_at" DESC);

-- CreateIndex
CREATE INDEX "idx_crm_contacts_tenant" ON "crm"."contacts"("tenant_id");

-- CreateIndex
CREATE INDEX "idx_crm_contacts_account" ON "crm"."contacts"("account_id");

-- CreateIndex
CREATE INDEX "idx_crm_contacts_created_desc" ON "crm"."contacts"("created_at" DESC);

-- CreateIndex
CREATE INDEX "idx_crm_pipeline_tenant" ON "crm"."pipeline_stages"("tenant_id");

-- CreateIndex
CREATE INDEX "idx_crm_pipeline_active" ON "crm"."pipeline_stages"("is_active");

-- CreateIndex
CREATE INDEX "idx_crm_pipeline_order" ON "crm"."pipeline_stages"("order");

-- CreateIndex
CREATE UNIQUE INDEX "uq_crm_pipeline_tenant_name" ON "crm"."pipeline_stages"("tenant_id", "name");

-- CreateIndex
CREATE INDEX "idx_crm_deals_tenant" ON "crm"."deals"("tenant_id");

-- CreateIndex
CREATE INDEX "idx_crm_deals_status" ON "crm"."deals"("status");

-- CreateIndex
CREATE INDEX "idx_crm_deals_stage" ON "crm"."deals"("stage_id");

-- CreateIndex
CREATE INDEX "idx_crm_deals_account" ON "crm"."deals"("account_id");

-- CreateIndex
CREATE INDEX "idx_crm_deals_created_desc" ON "crm"."deals"("created_at" DESC);

-- CreateIndex
CREATE INDEX "idx_crm_deal_stage_tenant" ON "crm"."deal_stage_history"("tenant_id");

-- CreateIndex
CREATE INDEX "idx_crm_deal_stage_deal" ON "crm"."deal_stage_history"("deal_id");

-- CreateIndex
CREATE INDEX "idx_crm_deal_stage_changed_desc" ON "crm"."deal_stage_history"("changed_at" DESC);

-- CreateIndex
CREATE INDEX "idx_crm_deal_quotes_tenant" ON "crm"."deal_quotes"("tenant_id");

-- CreateIndex
CREATE INDEX "idx_crm_deal_quotes_deal" ON "crm"."deal_quotes"("deal_id");

-- CreateIndex
CREATE INDEX "idx_crm_deal_quotes_quote" ON "crm"."deal_quotes"("quote_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_crm_deal_quote" ON "crm"."deal_quotes"("deal_id", "quote_id");

-- CreateIndex
CREATE INDEX "idx_crm_tasks_tenant" ON "crm"."tasks"("tenant_id");

-- CreateIndex
CREATE INDEX "idx_crm_tasks_status" ON "crm"."tasks"("status");

-- CreateIndex
CREATE INDEX "idx_crm_tasks_due" ON "crm"."tasks"("due_at");

-- CreateIndex
CREATE INDEX "idx_crm_tasks_deal" ON "crm"."tasks"("deal_id");

-- CreateIndex
CREATE INDEX "idx_crm_email_accounts_tenant" ON "crm"."email_accounts"("tenant_id");

-- CreateIndex
CREATE INDEX "idx_crm_email_accounts_user" ON "crm"."email_accounts"("user_id");

-- CreateIndex
CREATE INDEX "idx_crm_email_accounts_provider" ON "crm"."email_accounts"("provider");

-- CreateIndex
CREATE INDEX "idx_crm_email_threads_tenant" ON "crm"."email_threads"("tenant_id");

-- CreateIndex
CREATE INDEX "idx_crm_email_threads_account" ON "crm"."email_threads"("account_id");

-- CreateIndex
CREATE INDEX "idx_crm_email_threads_deal" ON "crm"."email_threads"("deal_id");

-- CreateIndex
CREATE INDEX "idx_crm_email_messages_tenant" ON "crm"."email_messages"("tenant_id");

-- CreateIndex
CREATE INDEX "idx_crm_email_messages_thread" ON "crm"."email_messages"("thread_id");

-- CreateIndex
CREATE INDEX "idx_crm_email_messages_sent" ON "crm"."email_messages"("sent_at");

-- CreateIndex
CREATE INDEX "idx_crm_files_tenant" ON "crm"."files"("tenant_id");

-- CreateIndex
CREATE INDEX "idx_crm_files_created_desc" ON "crm"."files"("created_at" DESC);

-- CreateIndex
CREATE INDEX "idx_crm_file_links_tenant" ON "crm"."file_links"("tenant_id");

-- CreateIndex
CREATE INDEX "idx_crm_file_links_file" ON "crm"."file_links"("file_id");

-- CreateIndex
CREATE INDEX "idx_crm_file_links_entity" ON "crm"."file_links"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "idx_crm_custom_fields_tenant" ON "crm"."custom_fields"("tenant_id");

-- CreateIndex
CREATE INDEX "idx_crm_custom_fields_entity" ON "crm"."custom_fields"("entity_type");

-- CreateIndex
CREATE INDEX "idx_crm_custom_values_tenant" ON "crm"."custom_field_values"("tenant_id");

-- CreateIndex
CREATE INDEX "idx_crm_custom_values_field" ON "crm"."custom_field_values"("field_id");

-- CreateIndex
CREATE INDEX "idx_crm_custom_values_entity" ON "crm"."custom_field_values"("entity_id");

-- CreateIndex
CREATE INDEX "idx_crm_history_tenant" ON "crm"."history_logs"("tenant_id");

-- CreateIndex
CREATE INDEX "idx_crm_history_entity" ON "crm"."history_logs"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "idx_crm_history_created_desc" ON "crm"."history_logs"("created_at" DESC);

-- AddForeignKey
ALTER TABLE "crm"."contacts" ADD CONSTRAINT "contacts_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "crm"."accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm"."deals" ADD CONSTRAINT "deals_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "crm"."accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm"."deals" ADD CONSTRAINT "deals_primary_contact_id_fkey" FOREIGN KEY ("primary_contact_id") REFERENCES "crm"."contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm"."deals" ADD CONSTRAINT "deals_stage_id_fkey" FOREIGN KEY ("stage_id") REFERENCES "crm"."pipeline_stages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm"."deal_stage_history" ADD CONSTRAINT "deal_stage_history_deal_id_fkey" FOREIGN KEY ("deal_id") REFERENCES "crm"."deals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm"."deal_stage_history" ADD CONSTRAINT "deal_stage_history_from_stage_id_fkey" FOREIGN KEY ("from_stage_id") REFERENCES "crm"."pipeline_stages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm"."deal_stage_history" ADD CONSTRAINT "deal_stage_history_to_stage_id_fkey" FOREIGN KEY ("to_stage_id") REFERENCES "crm"."pipeline_stages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm"."deal_quotes" ADD CONSTRAINT "deal_quotes_deal_id_fkey" FOREIGN KEY ("deal_id") REFERENCES "crm"."deals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm"."tasks" ADD CONSTRAINT "tasks_deal_id_fkey" FOREIGN KEY ("deal_id") REFERENCES "crm"."deals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm"."email_messages" ADD CONSTRAINT "email_messages_thread_id_fkey" FOREIGN KEY ("thread_id") REFERENCES "crm"."email_threads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm"."file_links" ADD CONSTRAINT "file_links_file_id_fkey" FOREIGN KEY ("file_id") REFERENCES "crm"."files"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm"."custom_field_values" ADD CONSTRAINT "custom_field_values_field_id_fkey" FOREIGN KEY ("field_id") REFERENCES "crm"."custom_fields"("id") ON DELETE CASCADE ON UPDATE CASCADE;

