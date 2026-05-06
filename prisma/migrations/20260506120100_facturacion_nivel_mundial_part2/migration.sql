-- ════════════════════════════════════════════════════════════════════
-- Facturación Nivel Mundial — Parte 2/2: schema sobre enum con DRAFT
-- ════════════════════════════════════════════════════════════════════
-- Esta migración asume que la parte 1 (20260506120000) ya añadió
-- 'DRAFT' al enum FinanceSiiStatus en una transacción previa.
-- Aditiva en su totalidad. No hace DROP de columnas ni tipos existentes.
-- ════════════════════════════════════════════════════════════════════

-- ── 1. Reemplazar el unique constraint por un partial unique index ──
-- Razón: los borradores (siiStatus=DRAFT) usan folio=0. Sin esta
-- modificación, sólo se podría tener UN borrador por (tenant, dteType,
-- direction). Excluyendo DRAFT del unique permitimos N borradores en
-- paralelo, manteniendo la unicidad real para DTEs emitidos.
ALTER TABLE "finance"."finance_dtes" DROP CONSTRAINT IF EXISTS "uq_finance_dte_folio";
DROP INDEX IF EXISTS "finance"."uq_finance_dte_folio";
CREATE UNIQUE INDEX IF NOT EXISTS "uq_finance_dte_folio_emitted"
  ON "finance"."finance_dtes" ("tenant_id", "direction", "dte_type", "folio")
  WHERE "sii_status" <> 'DRAFT';
CREATE INDEX IF NOT EXISTS "idx_finance_dte_folio_lookup"
  ON "finance"."finance_dtes" ("tenant_id", "direction", "dte_type", "folio");

-- ── 2. FinanceDte: campos UF de auditoría ────────────────────────────
ALTER TABLE "finance"."finance_dtes"
  ADD COLUMN IF NOT EXISTS "uf_value_at_issue" DECIMAL(14,2),
  ADD COLUMN IF NOT EXISTS "uf_date_at_issue"  DATE;

-- ── 3. FinanceDteLine: precio original UF ────────────────────────────
ALTER TABLE "finance"."finance_dte_lines"
  ADD COLUMN IF NOT EXISTS "unit_price_uf" DECIMAL(14,4);

-- ── 4. TenantDteConfig: emails XML al backoffice + plantilla email ──
ALTER TABLE "public"."tenant_dte_configs"
  ADD COLUMN IF NOT EXISTS "default_xml_recipient_emails"      TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN IF NOT EXISTS "default_xml_recipient_always_send" BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS "email_template_subject"            TEXT,
  ADD COLUMN IF NOT EXISTS "email_template_body"               TEXT;

-- ── 5. FinanceDteRecurringTemplate ───────────────────────────────────
CREATE TABLE IF NOT EXISTS "finance"."finance_dte_recurring_templates" (
  "id"                    UUID NOT NULL DEFAULT uuid_generate_v4(),
  "tenant_id"             TEXT NOT NULL,
  "name"                  TEXT NOT NULL,
  "is_active"             BOOLEAN NOT NULL DEFAULT TRUE,

  "dte_type"              INTEGER NOT NULL,
  "receiver_rut"          TEXT NOT NULL,
  "receiver_name"         TEXT NOT NULL,
  "receiver_email"        TEXT,
  "receiver_email_cc"     TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "receiver_giro"         TEXT,
  "receiver_direccion"    TEXT,
  "receiver_comuna"       TEXT,
  "receiver_ciudad"       TEXT,
  "crm_account_id"        UUID,
  "installation_id"       UUID,

  "currency"              TEXT NOT NULL DEFAULT 'CLP',
  "lines"                 JSONB NOT NULL,
  "notes"                 TEXT,
  "additional_references" JSONB,

  "frequency"             TEXT NOT NULL,
  "day_of_month"          INTEGER,
  "day_of_week"           INTEGER,
  "month_of_year"         INTEGER,

  "start_date"            DATE NOT NULL,
  "end_date"              DATE,
  "next_run_at"           DATE,
  "last_run_at"           DATE,
  "run_count"             INTEGER NOT NULL DEFAULT 0,

  "auto_send_email"       BOOLEAN NOT NULL DEFAULT TRUE,

  "created_by"            TEXT NOT NULL,
  "created_at"            TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
  "updated_at"            TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),

  CONSTRAINT "finance_dte_recurring_templates_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "idx_dte_recurring_tenant_active"
  ON "finance"."finance_dte_recurring_templates" ("tenant_id", "is_active");
CREATE INDEX IF NOT EXISTS "idx_dte_recurring_next_run"
  ON "finance"."finance_dte_recurring_templates" ("next_run_at");

-- ── 6. FinanceDteRecurringRun ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "finance"."finance_dte_recurring_runs" (
  "id"          UUID NOT NULL DEFAULT uuid_generate_v4(),
  "tenant_id"   TEXT NOT NULL,
  "template_id" UUID NOT NULL,
  "dte_id"      UUID,
  "status"      TEXT NOT NULL,
  "error"       TEXT,
  "ran_at"      TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),

  CONSTRAINT "finance_dte_recurring_runs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "finance_dte_recurring_runs_template_fkey"
    FOREIGN KEY ("template_id")
    REFERENCES "finance"."finance_dte_recurring_templates"("id")
    ON DELETE CASCADE,
  CONSTRAINT "finance_dte_recurring_runs_dte_fkey"
    FOREIGN KEY ("dte_id")
    REFERENCES "finance"."finance_dtes"("id")
    ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS "idx_dte_recurring_run_template"
  ON "finance"."finance_dte_recurring_runs" ("tenant_id", "template_id");

-- ── 7. FinanceDteEmailLog ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "finance"."finance_dte_email_logs" (
  "id"            UUID NOT NULL DEFAULT uuid_generate_v4(),
  "tenant_id"     TEXT NOT NULL,
  "dte_id"        UUID NOT NULL,
  "kind"          TEXT NOT NULL,
  "to"            TEXT[] NOT NULL,
  "cc"            TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "subject"       TEXT NOT NULL,
  "attachments"   TEXT NOT NULL,
  "status"        TEXT NOT NULL,
  "resend_id"     TEXT,
  "error_message" TEXT,
  "sent_at"       TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
  "sent_by"       TEXT,

  CONSTRAINT "finance_dte_email_logs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "finance_dte_email_logs_dte_fkey"
    FOREIGN KEY ("dte_id")
    REFERENCES "finance"."finance_dtes"("id")
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "idx_dte_email_log_dte"
  ON "finance"."finance_dte_email_logs" ("tenant_id", "dte_id");
CREATE INDEX IF NOT EXISTS "idx_dte_email_log_sent"
  ON "finance"."finance_dte_email_logs" ("tenant_id", "sent_at");
