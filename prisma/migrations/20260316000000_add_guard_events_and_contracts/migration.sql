-- Add contract tracking fields to guardias
ALTER TABLE "ops"."guardias"
  ADD COLUMN "contract_type" TEXT DEFAULT 'indefinido',
  ADD COLUMN "contract_start_date" DATE,
  ADD COLUMN "contract_period_1_end" DATE,
  ADD COLUMN "contract_period_2_end" DATE,
  ADD COLUMN "contract_period_3_end" DATE,
  ADD COLUMN "contract_current_period" INTEGER DEFAULT 1,
  ADD COLUMN "contract_became_indefinido_at" DATE,
  ADD COLUMN "contract_alert_days_before" INTEGER DEFAULT 5;

-- Create guard_events table
CREATE TABLE "ops"."guard_events" (
  "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
  "tenant_id" TEXT NOT NULL,
  "guardia_id" UUID NOT NULL,
  "category" TEXT NOT NULL,
  "subtype" TEXT NOT NULL,
  "start_date" DATE,
  "end_date" DATE,
  "total_days" INTEGER,
  "finiquito_date" DATE,
  "causal_dt_code" TEXT,
  "causal_dt_label" TEXT,
  "vacation_days_pending" INTEGER,
  "vacation_payment_amount" DECIMAL(12,0),
  "pending_remuneration_amount" DECIMAL(12,0),
  "years_of_service_amount" DECIMAL(12,0),
  "substitute_notice_amount" DECIMAL(12,0),
  "total_settlement_amount" DECIMAL(12,0),
  "reason" TEXT,
  "internal_notes" TEXT,
  "attachments" JSONB,
  "metadata" JSONB,
  "status" TEXT NOT NULL DEFAULT 'draft',
  "created_by" TEXT NOT NULL,
  "approved_by" TEXT,
  "approved_at" TIMESTAMPTZ(6),
  "rejected_by" TEXT,
  "rejected_at" TIMESTAMPTZ(6),
  "cancelled_by" TEXT,
  "cancelled_at" TIMESTAMPTZ(6),
  "rejection_reason" TEXT,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "guard_events_pkey" PRIMARY KEY ("id")
);

-- Foreign key
ALTER TABLE "ops"."guard_events"
  ADD CONSTRAINT "guard_events_guardia_id_fkey"
  FOREIGN KEY ("guardia_id") REFERENCES "ops"."guardias"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Indexes
CREATE INDEX "idx_ops_guard_events_tenant" ON "ops"."guard_events"("tenant_id");
CREATE INDEX "idx_ops_guard_events_guardia" ON "ops"."guard_events"("guardia_id");
CREATE INDEX "idx_ops_guard_events_category" ON "ops"."guard_events"("category");
CREATE INDEX "idx_ops_guard_events_status" ON "ops"."guard_events"("status");
CREATE INDEX "idx_ops_guard_events_finiquito_date" ON "ops"."guard_events"("finiquito_date");
