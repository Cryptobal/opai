-- DDL manual para el schema psych (Fase 1 + Fase 1.5).
-- Aplicable con: psql "$DATABASE_URL" -f scripts/psych/ddl-psych-schema.sql
-- Idempotente: todos los CREATE usan IF NOT EXISTS o equivalente.

CREATE SCHEMA IF NOT EXISTS psych;

-- ── Enums ──

DO $$ BEGIN
  CREATE TYPE psych."PsychItemType" AS ENUM ('LIKERT','SJT','COGNITIVE','OPEN','LIE');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE psych."PsychAssessmentStatus" AS ENUM ('PENDING','STARTED','SUBMITTED','SCORED','REVIEWED','EXPIRED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE psych."PsychBand" AS ENUM ('FIT','FIT_CAUTION','NOT_RECOMMENDED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE psych."PsychClientReportLevel" AS ENUM ('SEAL','SUMMARY','FULL');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── Tables ──

CREATE TABLE IF NOT EXISTS psych.test_versions (
  id            TEXT PRIMARY KEY,
  code          TEXT NOT NULL,
  version       TEXT NOT NULL,
  name          TEXT NOT NULL,
  description   TEXT,
  is_active     BOOLEAN NOT NULL DEFAULT true,
  published_at  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_test_versions_code_version UNIQUE (code, version)
);

CREATE TABLE IF NOT EXISTS psych.items (
  id              TEXT PRIMARY KEY,
  version_id      TEXT NOT NULL REFERENCES psych.test_versions(id) ON DELETE CASCADE,
  "order"         INTEGER NOT NULL,
  type            psych."PsychItemType" NOT NULL,
  dimension       TEXT NOT NULL,
  prompt          TEXT NOT NULL,
  options         JSONB,
  scoring_key     JSONB NOT NULL,
  reverse_score   BOOLEAN NOT NULL DEFAULT false,
  weight          DOUBLE PRECISION NOT NULL DEFAULT 1.0,
  min_latency_ms  INTEGER NOT NULL DEFAULT 800,
  max_latency_ms  INTEGER NOT NULL DEFAULT 120000,
  created_at      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS items_version_id_order_idx ON psych.items(version_id, "order");

CREATE TABLE IF NOT EXISTS psych.tenant_config (
  id                             TEXT PRIMARY KEY,
  tenant_id                      TEXT NOT NULL,
  weight_impulse                 DOUBLE PRECISION NOT NULL DEFAULT 1.0,
  weight_frustration             DOUBLE PRECISION NOT NULL DEFAULT 1.0,
  weight_stability               DOUBLE PRECISION NOT NULL DEFAULT 1.0,
  weight_stress                  DOUBLE PRECISION NOT NULL DEFAULT 1.0,
  weight_attention               DOUBLE PRECISION NOT NULL DEFAULT 1.0,
  weight_reasoning               DOUBLE PRECISION NOT NULL DEFAULT 1.0,
  weight_integrity               DOUBLE PRECISION NOT NULL DEFAULT 1.0,
  weight_responsibility          DOUBLE PRECISION NOT NULL DEFAULT 1.0,
  threshold_fit                  INTEGER NOT NULL DEFAULT 80,
  threshold_caution              INTEGER NOT NULL DEFAULT 60,
  require_psych_review           BOOLEAN NOT NULL DEFAULT false,
  invitation_ttl_hours           INTEGER NOT NULL DEFAULT 168,
  brand_logo_url                 TEXT,
  brand_primary_color            TEXT,
  default_version_code           TEXT NOT NULL DEFAULT 'security-guard-v1',
  default_version_tag            TEXT NOT NULL DEFAULT '1.0.0',
  -- Fase 1.5
  reevaluation_interval_months   INTEGER NOT NULL DEFAULT 6,
  whatsapp_template              TEXT,
  email_subject                  TEXT,
  email_body                     TEXT,
  sms_template                   TEXT,
  default_client_report_level    psych."PsychClientReportLevel" NOT NULL DEFAULT 'SEAL',
  updated_at                     TIMESTAMP(3) NOT NULL,
  CONSTRAINT uq_tenant_config_tenant_id UNIQUE (tenant_id)
);

CREATE TABLE IF NOT EXISTS psych.assessments (
  id                    TEXT PRIMARY KEY,
  tenant_id             TEXT NOT NULL,
  version_id            TEXT NOT NULL REFERENCES psych.test_versions(id),
  persona_id            TEXT,
  target_name           TEXT NOT NULL,
  target_rut            TEXT,
  target_email          TEXT,
  target_phone          TEXT,
  invitation_token      TEXT NOT NULL UNIQUE,
  status                psych."PsychAssessmentStatus" NOT NULL DEFAULT 'PENDING',
  started_at            TIMESTAMP(3),
  submitted_at          TIMESTAMP(3),
  scored_at             TIMESTAMP(3),
  expires_at            TIMESTAMP(3) NOT NULL,
  client_metadata       JSONB,
  consent_accepted_at   TIMESTAMP(3),
  created_by_id         TEXT,
  created_at            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS assessments_tenant_status_idx ON psych.assessments(tenant_id, status);
CREATE INDEX IF NOT EXISTS assessments_tenant_persona_idx ON psych.assessments(tenant_id, persona_id);
CREATE INDEX IF NOT EXISTS assessments_invitation_token_idx ON psych.assessments(invitation_token);

CREATE TABLE IF NOT EXISTS psych.responses (
  id              TEXT PRIMARY KEY,
  assessment_id   TEXT NOT NULL REFERENCES psych.assessments(id) ON DELETE CASCADE,
  item_id         TEXT NOT NULL,
  item_order      INTEGER NOT NULL,
  value           JSONB NOT NULL,
  latency_ms      INTEGER,
  answered_at     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_responses_assessment_item UNIQUE (assessment_id, item_id)
);
CREATE INDEX IF NOT EXISTS responses_assessment_idx ON psych.responses(assessment_id);

CREATE TABLE IF NOT EXISTS psych.results (
  id                TEXT PRIMARY KEY,
  assessment_id     TEXT NOT NULL UNIQUE REFERENCES psych.assessments(id) ON DELETE CASCADE,
  global_score      DOUBLE PRECISION NOT NULL,
  band              psych."PsychBand" NOT NULL,
  dimension_scores  JSONB NOT NULL,
  alerts            JSONB NOT NULL,
  lie_scale_score   DOUBLE PRECISION,
  straight_lining   BOOLEAN NOT NULL DEFAULT false,
  open_analysis     JSONB,
  scoring_version   TEXT NOT NULL,
  reviewed_by       TEXT,
  reviewed_at       TIMESTAMP(3),
  review_note       TEXT,
  created_at        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Fase 1.5
CREATE TABLE IF NOT EXISTS psych.client_contract_config (
  id                    TEXT PRIMARY KEY,
  tenant_id             TEXT NOT NULL,
  contract_id           TEXT NOT NULL UNIQUE,
  report_level          psych."PsychClientReportLevel" NOT NULL DEFAULT 'SEAL',
  show_evaluation_date  BOOLEAN NOT NULL DEFAULT true,
  show_coverage         BOOLEAN NOT NULL DEFAULT true,
  show_individual_seal  BOOLEAN NOT NULL DEFAULT true,
  dpa_signed_at         TIMESTAMP(3),
  dpa_doc_id            TEXT,
  dpa_note              TEXT,
  updated_at            TIMESTAMP(3) NOT NULL,
  created_at            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS client_contract_config_tenant_idx ON psych.client_contract_config(tenant_id);
