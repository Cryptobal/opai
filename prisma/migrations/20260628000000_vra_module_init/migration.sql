-- Módulo VRA — Vulnerability & Risk Assessment
-- Bloque 1: catálogo de secciones + scaffolding de informes (sin generación)

-- 1) Schema
CREATE SCHEMA IF NOT EXISTS "vra";

-- 2) Extensión uuid (idempotente, ya debería existir)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 3) Agregar visit_type a visitas_supervision
ALTER TABLE "ops"."visitas_supervision"
  ADD COLUMN IF NOT EXISTS "visit_type" text NOT NULL DEFAULT 'regular';

CREATE INDEX IF NOT EXISTS "idx_ops_visitas_supervision_visit_type"
  ON "ops"."visitas_supervision" ("visit_type");

-- 4) Tabla section_templates
CREATE TABLE IF NOT EXISTS "vra"."section_templates" (
  "id"                 uuid          NOT NULL DEFAULT uuid_generate_v4(),
  "tenant_id"          text,
  "parent_id"          uuid,
  "key"                text          NOT NULL,
  "title"              text          NOT NULL,
  "description"        text          NOT NULL,
  "ai_prompt_hint"     text,
  "output_type"        text          NOT NULL,
  "data_inputs"        jsonb         NOT NULL DEFAULT '[]'::jsonb,
  "numbering_override" text,
  "sort_order"         integer       NOT NULL DEFAULT 0,
  "is_enabled"         boolean       NOT NULL DEFAULT true,
  "is_system"          boolean       NOT NULL DEFAULT false,
  "is_mandatory"       boolean       NOT NULL DEFAULT false,
  "icon_name"          text,
  "created_by"         text,
  "created_at"         timestamptz(6) NOT NULL DEFAULT now(),
  "updated_at"         timestamptz(6) NOT NULL DEFAULT now(),
  CONSTRAINT "section_templates_pkey" PRIMARY KEY ("id")
);

-- 5) FKs (tenant cascade, parent set null)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'section_templates_tenant_id_fkey'
  ) THEN
    ALTER TABLE "vra"."section_templates"
      ADD CONSTRAINT "section_templates_tenant_id_fkey"
        FOREIGN KEY ("tenant_id") REFERENCES "public"."Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'section_templates_parent_id_fkey'
  ) THEN
    ALTER TABLE "vra"."section_templates"
      ADD CONSTRAINT "section_templates_parent_id_fkey"
        FOREIGN KEY ("parent_id") REFERENCES "vra"."section_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- 6) Índices section_templates
CREATE UNIQUE INDEX IF NOT EXISTS "uq_vra_section_templates_tenant_key"
  ON "vra"."section_templates" ("tenant_id", "key");
CREATE INDEX IF NOT EXISTS "idx_vra_section_templates_tenant"
  ON "vra"."section_templates" ("tenant_id");
CREATE INDEX IF NOT EXISTS "idx_vra_section_templates_is_system"
  ON "vra"."section_templates" ("is_system");
CREATE INDEX IF NOT EXISTS "idx_vra_section_templates_tenant_order"
  ON "vra"."section_templates" ("tenant_id", "is_enabled", "sort_order");

-- 7) Tabla reports
CREATE TABLE IF NOT EXISTS "vra"."reports" (
  "id"                  uuid          NOT NULL DEFAULT uuid_generate_v4(),
  "tenant_id"           text          NOT NULL,
  "installation_id"     uuid          NOT NULL,
  "visit_id"            uuid,
  "doc_operacional_id"  uuid,
  "unique_id"           text          NOT NULL,
  "public_token"        text,
  "title"               text          NOT NULL,
  "status"              text          NOT NULL DEFAULT 'draft',
  "risk_level"          text,
  "version"             integer       NOT NULL DEFAULT 1,
  "metadata"            jsonb,
  "generated_at"        timestamptz(6),
  "approved_by"         text,
  "approved_at"         timestamptz(6),
  "sent_to_client_at"   timestamptz(6),
  "portal_visible"      boolean       NOT NULL DEFAULT false,
  "pdf_url"             text,
  "pdf_storage_key"     text,
  "html_snapshot"       text,
  "created_by"          text          NOT NULL,
  "created_at"          timestamptz(6) NOT NULL DEFAULT now(),
  "updated_at"          timestamptz(6) NOT NULL DEFAULT now(),
  CONSTRAINT "reports_pkey" PRIMARY KEY ("id")
);

-- 8) FKs reports
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'reports_tenant_id_fkey'
  ) THEN
    ALTER TABLE "vra"."reports"
      ADD CONSTRAINT "reports_tenant_id_fkey"
        FOREIGN KEY ("tenant_id") REFERENCES "public"."Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'reports_installation_id_fkey'
  ) THEN
    ALTER TABLE "vra"."reports"
      ADD CONSTRAINT "reports_installation_id_fkey"
        FOREIGN KEY ("installation_id") REFERENCES "crm"."installations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'reports_visit_id_fkey'
  ) THEN
    ALTER TABLE "vra"."reports"
      ADD CONSTRAINT "reports_visit_id_fkey"
        FOREIGN KEY ("visit_id") REFERENCES "ops"."visitas_supervision"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'reports_doc_operacional_id_fkey'
  ) THEN
    ALTER TABLE "vra"."reports"
      ADD CONSTRAINT "reports_doc_operacional_id_fkey"
        FOREIGN KEY ("doc_operacional_id") REFERENCES "ops"."docs_operacionales"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- 9) Índices reports
CREATE UNIQUE INDEX IF NOT EXISTS "reports_unique_id_key"
  ON "vra"."reports" ("unique_id");
CREATE UNIQUE INDEX IF NOT EXISTS "reports_public_token_key"
  ON "vra"."reports" ("public_token") WHERE "public_token" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "idx_vra_reports_tenant"           ON "vra"."reports" ("tenant_id");
CREATE INDEX IF NOT EXISTS "idx_vra_reports_installation"     ON "vra"."reports" ("installation_id");
CREATE INDEX IF NOT EXISTS "idx_vra_reports_visit"            ON "vra"."reports" ("visit_id");
CREATE INDEX IF NOT EXISTS "idx_vra_reports_doc_operacional"  ON "vra"."reports" ("doc_operacional_id");
CREATE INDEX IF NOT EXISTS "idx_vra_reports_status"           ON "vra"."reports" ("status");
CREATE INDEX IF NOT EXISTS "idx_vra_reports_portal_visible"   ON "vra"."reports" ("tenant_id", "portal_visible");
CREATE INDEX IF NOT EXISTS "idx_vra_reports_unique_id"        ON "vra"."reports" ("unique_id");

-- 10) Tabla report_sections
CREATE TABLE IF NOT EXISTS "vra"."report_sections" (
  "id"             uuid          NOT NULL DEFAULT uuid_generate_v4(),
  "report_id"      uuid          NOT NULL,
  "template_id"    uuid,
  "key"            text          NOT NULL,
  "title"          text          NOT NULL,
  "description"    text,
  "output_type"    text          NOT NULL,
  "numbering"      text,
  "sort_order"     integer       NOT NULL DEFAULT 0,
  "status"         text          NOT NULL DEFAULT 'pending',
  "content_json"   jsonb,
  "ai_model"       text,
  "ai_tokens_in"   integer,
  "ai_tokens_out"  integer,
  "ai_cost_cents"  integer,
  "error_message"  text,
  "generated_at"   timestamptz(6),
  "created_at"     timestamptz(6) NOT NULL DEFAULT now(),
  "updated_at"     timestamptz(6) NOT NULL DEFAULT now(),
  CONSTRAINT "report_sections_pkey" PRIMARY KEY ("id")
);

-- 11) FKs report_sections
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'report_sections_report_id_fkey'
  ) THEN
    ALTER TABLE "vra"."report_sections"
      ADD CONSTRAINT "report_sections_report_id_fkey"
        FOREIGN KEY ("report_id") REFERENCES "vra"."reports"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- 12) Índices report_sections
CREATE UNIQUE INDEX IF NOT EXISTS "uq_vra_report_sections_order"
  ON "vra"."report_sections" ("report_id", "sort_order");
CREATE INDEX IF NOT EXISTS "idx_vra_report_sections_report"
  ON "vra"."report_sections" ("report_id");
CREATE INDEX IF NOT EXISTS "idx_vra_report_sections_status"
  ON "vra"."report_sections" ("status");

-- 13) Trigger updated_at en las 3 tablas (consistente con el resto del schema)
CREATE OR REPLACE FUNCTION "vra"."set_updated_at"() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'tg_vra_section_templates_updated_at') THEN
    CREATE TRIGGER "tg_vra_section_templates_updated_at"
      BEFORE UPDATE ON "vra"."section_templates"
      FOR EACH ROW EXECUTE FUNCTION "vra"."set_updated_at"();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'tg_vra_reports_updated_at') THEN
    CREATE TRIGGER "tg_vra_reports_updated_at"
      BEFORE UPDATE ON "vra"."reports"
      FOR EACH ROW EXECUTE FUNCTION "vra"."set_updated_at"();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'tg_vra_report_sections_updated_at') THEN
    CREATE TRIGGER "tg_vra_report_sections_updated_at"
      BEFORE UPDATE ON "vra"."report_sections"
      FOR EACH ROW EXECUTE FUNCTION "vra"."set_updated_at"();
  END IF;
END $$;
