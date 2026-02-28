-- Supervision Module Refactor: New tables and columns for the enhanced supervision wizard

-- 1. ALTER visitas_supervision to add new fields
ALTER TABLE "ops"."visitas_supervision"
  ADD COLUMN IF NOT EXISTS "duration_minutes" INTEGER,
  ADD COLUMN IF NOT EXISTS "guards_expected" INTEGER,
  ADD COLUMN IF NOT EXISTS "guards_found" INTEGER,
  ADD COLUMN IF NOT EXISTS "book_up_to_date" BOOLEAN,
  ADD COLUMN IF NOT EXISTS "book_last_entry_date" DATE,
  ADD COLUMN IF NOT EXISTS "book_photo_url" TEXT,
  ADD COLUMN IF NOT EXISTS "book_notes" TEXT,
  ADD COLUMN IF NOT EXISTS "client_contacted" BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS "client_contact_name" TEXT,
  ADD COLUMN IF NOT EXISTS "client_satisfaction" INTEGER,
  ADD COLUMN IF NOT EXISTS "client_comment" TEXT,
  ADD COLUMN IF NOT EXISTS "client_validation_url" TEXT,
  ADD COLUMN IF NOT EXISTS "health_score" INTEGER,
  ADD COLUMN IF NOT EXISTS "is_express_flagged" BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS "draft_data" JSONB,
  ADD COLUMN IF NOT EXISTS "wizard_step" INTEGER DEFAULT 1;

-- 2. Individual guard evaluations per visit
CREATE TABLE "ops"."supervision_guard_evaluations" (
  "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
  "tenant_id" TEXT NOT NULL,
  "visit_id" UUID NOT NULL,
  "guard_id" UUID,
  "guard_name" TEXT NOT NULL,
  "presentation_score" INTEGER CHECK ("presentation_score" BETWEEN 1 AND 5),
  "order_score" INTEGER CHECK ("order_score" BETWEEN 1 AND 5),
  "protocol_score" INTEGER CHECK ("protocol_score" BETWEEN 1 AND 5),
  "observation" TEXT,
  "is_reinforcement" BOOLEAN NOT NULL DEFAULT false,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "supervision_guard_evaluations_pkey" PRIMARY KEY ("id")
);

-- 3. Supervision findings (linked to tickets)
CREATE TABLE "ops"."supervision_findings" (
  "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
  "tenant_id" TEXT NOT NULL,
  "visit_id" UUID NOT NULL,
  "installation_id" UUID NOT NULL,
  "guard_id" UUID,
  "category" TEXT NOT NULL,
  "severity" TEXT NOT NULL DEFAULT 'minor',
  "description" TEXT NOT NULL,
  "photo_url" TEXT,
  "ticket_id" UUID,
  "status" TEXT NOT NULL DEFAULT 'open',
  "resolved_at" TIMESTAMPTZ(6),
  "verified_in_visit_id" UUID,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "supervision_findings_pkey" PRIMARY KEY ("id")
);

-- 4. Dynamic checklist items per installation
CREATE TABLE "ops"."installation_checklist_items" (
  "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
  "tenant_id" TEXT NOT NULL,
  "installation_id" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "category" TEXT,
  "is_mandatory" BOOLEAN NOT NULL DEFAULT false,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "installation_checklist_items_pkey" PRIMARY KEY ("id")
);

-- 5. Checklist results per visit
CREATE TABLE "ops"."supervision_checklist_results" (
  "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
  "tenant_id" TEXT NOT NULL,
  "visit_id" UUID NOT NULL,
  "checklist_item_id" UUID NOT NULL,
  "is_checked" BOOLEAN NOT NULL DEFAULT false,
  "finding_id" UUID,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "supervision_checklist_results_pkey" PRIMARY KEY ("id")
);

-- 6. Photo categories per installation
CREATE TABLE "ops"."installation_photo_categories" (
  "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
  "tenant_id" TEXT NOT NULL,
  "installation_id" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "is_mandatory" BOOLEAN NOT NULL DEFAULT false,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "installation_photo_categories_pkey" PRIMARY KEY ("id")
);

-- 7. Categorized photos per visit
CREATE TABLE "ops"."supervision_photos" (
  "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
  "tenant_id" TEXT NOT NULL,
  "visit_id" UUID NOT NULL,
  "category_id" UUID,
  "category_name" TEXT,
  "photo_url" TEXT NOT NULL,
  "storage_key" TEXT NOT NULL,
  "file_name" TEXT,
  "mime_type" TEXT,
  "size" INTEGER,
  "gps_lat" DECIMAL(10,7),
  "gps_lng" DECIMAL(10,7),
  "taken_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "supervision_photos_pkey" PRIMARY KEY ("id")
);

-- 8. Health score cache per installation
CREATE TABLE "ops"."installation_health_scores" (
  "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
  "tenant_id" TEXT NOT NULL,
  "installation_id" UUID NOT NULL,
  "score" INTEGER NOT NULL DEFAULT 0,
  "avg_rating" DECIMAL(3,1),
  "days_since_last_visit" INTEGER,
  "open_findings_count" INTEGER NOT NULL DEFAULT 0,
  "overdue_findings_count" INTEGER NOT NULL DEFAULT 0,
  "last_dotation_compliance" DECIMAL(5,2),
  "last_checklist_compliance" DECIMAL(5,2),
  "book_up_to_date" BOOLEAN,
  "calculated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "installation_health_scores_pkey" PRIMARY KEY ("id")
);

-- INDEXES

-- Guard evaluations
CREATE INDEX "idx_supervision_guard_eval_tenant" ON "ops"."supervision_guard_evaluations" ("tenant_id");
CREATE INDEX "idx_supervision_guard_eval_visit" ON "ops"."supervision_guard_evaluations" ("visit_id");
CREATE INDEX "idx_supervision_guard_eval_guard" ON "ops"."supervision_guard_evaluations" ("guard_id");

-- Findings
CREATE INDEX "idx_supervision_findings_tenant" ON "ops"."supervision_findings" ("tenant_id");
CREATE INDEX "idx_supervision_findings_visit" ON "ops"."supervision_findings" ("visit_id");
CREATE INDEX "idx_supervision_findings_installation" ON "ops"."supervision_findings" ("installation_id");
CREATE INDEX "idx_supervision_findings_status" ON "ops"."supervision_findings" ("status");
CREATE INDEX "idx_supervision_findings_guard" ON "ops"."supervision_findings" ("guard_id");

-- Installation checklist items
CREATE INDEX "idx_installation_checklist_items_tenant" ON "ops"."installation_checklist_items" ("tenant_id");
CREATE INDEX "idx_installation_checklist_items_installation" ON "ops"."installation_checklist_items" ("installation_id");

-- Checklist results
CREATE INDEX "idx_supervision_checklist_results_visit" ON "ops"."supervision_checklist_results" ("visit_id");
CREATE INDEX "idx_supervision_checklist_results_item" ON "ops"."supervision_checklist_results" ("checklist_item_id");

-- Photo categories
CREATE INDEX "idx_installation_photo_categories_installation" ON "ops"."installation_photo_categories" ("installation_id");

-- Supervision photos
CREATE INDEX "idx_supervision_photos_visit" ON "ops"."supervision_photos" ("visit_id");
CREATE INDEX "idx_supervision_photos_category" ON "ops"."supervision_photos" ("category_id");

-- Health scores
CREATE UNIQUE INDEX "uq_installation_health_scores_installation" ON "ops"."installation_health_scores" ("installation_id");
CREATE INDEX "idx_installation_health_scores_tenant" ON "ops"."installation_health_scores" ("tenant_id");
CREATE INDEX "idx_installation_health_scores_score" ON "ops"."installation_health_scores" ("score");

-- FOREIGN KEYS

-- Guard evaluations
ALTER TABLE "ops"."supervision_guard_evaluations"
  ADD CONSTRAINT "supervision_guard_evaluations_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "public"."Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ops"."supervision_guard_evaluations"
  ADD CONSTRAINT "supervision_guard_evaluations_visit_id_fkey"
  FOREIGN KEY ("visit_id") REFERENCES "ops"."visitas_supervision"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ops"."supervision_guard_evaluations"
  ADD CONSTRAINT "supervision_guard_evaluations_guard_id_fkey"
  FOREIGN KEY ("guard_id") REFERENCES "ops"."guardias"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Findings
ALTER TABLE "ops"."supervision_findings"
  ADD CONSTRAINT "supervision_findings_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "public"."Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ops"."supervision_findings"
  ADD CONSTRAINT "supervision_findings_visit_id_fkey"
  FOREIGN KEY ("visit_id") REFERENCES "ops"."visitas_supervision"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ops"."supervision_findings"
  ADD CONSTRAINT "supervision_findings_installation_id_fkey"
  FOREIGN KEY ("installation_id") REFERENCES "crm"."installations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ops"."supervision_findings"
  ADD CONSTRAINT "supervision_findings_guard_id_fkey"
  FOREIGN KEY ("guard_id") REFERENCES "ops"."guardias"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ops"."supervision_findings"
  ADD CONSTRAINT "supervision_findings_ticket_id_fkey"
  FOREIGN KEY ("ticket_id") REFERENCES "ops"."ops_tickets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ops"."supervision_findings"
  ADD CONSTRAINT "supervision_findings_verified_visit_fkey"
  FOREIGN KEY ("verified_in_visit_id") REFERENCES "ops"."visitas_supervision"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Installation checklist items
ALTER TABLE "ops"."installation_checklist_items"
  ADD CONSTRAINT "installation_checklist_items_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "public"."Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ops"."installation_checklist_items"
  ADD CONSTRAINT "installation_checklist_items_installation_id_fkey"
  FOREIGN KEY ("installation_id") REFERENCES "crm"."installations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Checklist results
ALTER TABLE "ops"."supervision_checklist_results"
  ADD CONSTRAINT "supervision_checklist_results_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "public"."Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ops"."supervision_checklist_results"
  ADD CONSTRAINT "supervision_checklist_results_visit_id_fkey"
  FOREIGN KEY ("visit_id") REFERENCES "ops"."visitas_supervision"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ops"."supervision_checklist_results"
  ADD CONSTRAINT "supervision_checklist_results_item_fkey"
  FOREIGN KEY ("checklist_item_id") REFERENCES "ops"."installation_checklist_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ops"."supervision_checklist_results"
  ADD CONSTRAINT "supervision_checklist_results_finding_fkey"
  FOREIGN KEY ("finding_id") REFERENCES "ops"."supervision_findings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Photo categories
ALTER TABLE "ops"."installation_photo_categories"
  ADD CONSTRAINT "installation_photo_categories_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "public"."Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ops"."installation_photo_categories"
  ADD CONSTRAINT "installation_photo_categories_installation_id_fkey"
  FOREIGN KEY ("installation_id") REFERENCES "crm"."installations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Supervision photos
ALTER TABLE "ops"."supervision_photos"
  ADD CONSTRAINT "supervision_photos_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "public"."Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ops"."supervision_photos"
  ADD CONSTRAINT "supervision_photos_visit_id_fkey"
  FOREIGN KEY ("visit_id") REFERENCES "ops"."visitas_supervision"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ops"."supervision_photos"
  ADD CONSTRAINT "supervision_photos_category_id_fkey"
  FOREIGN KEY ("category_id") REFERENCES "ops"."installation_photo_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Health scores
ALTER TABLE "ops"."installation_health_scores"
  ADD CONSTRAINT "installation_health_scores_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "public"."Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ops"."installation_health_scores"
  ADD CONSTRAINT "installation_health_scores_installation_id_fkey"
  FOREIGN KEY ("installation_id") REFERENCES "crm"."installations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
