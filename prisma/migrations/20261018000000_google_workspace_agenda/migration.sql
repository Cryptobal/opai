-- ──────────────────────────────────────────────────────────────────────
-- Google Workspace · Agenda · Licitaciones — migración 100% ADITIVA.
--
-- Contenido:
--   1. crm.deals: is_licitacion + fecha_entrega
--   2. crm.email_messages: email_account_id
--   3. public.google_drive_workspaces
--   4. public.drive_folder_cache
--   5. public.drive_export_outbox
--   6. public.google_calendar_accounts
--   7. public.agenda_visitas (+ FKs a crm)
--   8. public.agenda_event_links
--
-- Sólo ADD COLUMN / CREATE TABLE / CREATE INDEX / ADD CONSTRAINT IF NOT EXISTS.
-- No hay DROP ni ALTER destructivo.
-- ──────────────────────────────────────────────────────────────────────

-- 1. CrmDeal — flags de licitación ─────────────────────────────────────
ALTER TABLE "crm"."deals"
  ADD COLUMN IF NOT EXISTS "is_licitacion" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "fecha_entrega" DATE;

CREATE INDEX IF NOT EXISTS "idx_crm_deals_licitacion"
  ON "crm"."deals" ("tenant_id", "is_licitacion", "fecha_entrega");

-- 2. CrmEmailMessage — atribución de casilla ───────────────────────────
ALTER TABLE "crm"."email_messages"
  ADD COLUMN IF NOT EXISTS "email_account_id" UUID;

CREATE INDEX IF NOT EXISTS "idx_crm_email_messages_account"
  ON "crm"."email_messages" ("email_account_id");

-- 3. Google Drive workspace (tenant) ───────────────────────────────────
CREATE TABLE IF NOT EXISTS "public"."google_drive_workspaces" (
  "id"                TEXT NOT NULL,
  "tenant_id"         TEXT NOT NULL,
  "google_email"      TEXT NOT NULL,
  "access_token_enc"  TEXT NOT NULL,
  "refresh_token_enc" TEXT NOT NULL,
  "token_expires_at"  TIMESTAMP(3),
  "root_folder_id"    TEXT,
  "mirror_config"     JSONB NOT NULL DEFAULT '{}',
  "status"            TEXT NOT NULL DEFAULT 'ACTIVE',
  "connected_by"      TEXT NOT NULL,
  "created_at"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"        TIMESTAMP(3) NOT NULL,
  CONSTRAINT "google_drive_workspaces_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "google_drive_workspaces_tenant_id_key"
  ON "public"."google_drive_workspaces" ("tenant_id");

-- 4. Drive folder cache ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "public"."drive_folder_cache" (
  "id"              TEXT NOT NULL,
  "tenant_id"       TEXT NOT NULL,
  "path_key"        TEXT NOT NULL,
  "drive_folder_id" TEXT NOT NULL,
  "created_at"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "drive_folder_cache_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "uq_drive_folder_cache_tenant_path"
  ON "public"."drive_folder_cache" ("tenant_id", "path_key");
CREATE INDEX IF NOT EXISTS "idx_drive_folder_cache_tenant"
  ON "public"."drive_folder_cache" ("tenant_id");

-- 5. Drive export outbox ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "public"."drive_export_outbox" (
  "id"            TEXT NOT NULL,
  "tenant_id"     TEXT NOT NULL,
  "doc_type"      TEXT NOT NULL,
  "source_type"   TEXT NOT NULL,
  "source_id"     TEXT NOT NULL,
  "r2_key"        TEXT,
  "file_name"     TEXT NOT NULL,
  "target_path"   TEXT NOT NULL,
  "drive_file_id" TEXT,
  "status"        TEXT NOT NULL DEFAULT 'PENDING',
  "attempts"      INTEGER NOT NULL DEFAULT 0,
  "last_error"    TEXT,
  "created_at"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "sent_at"       TIMESTAMP(3),
  CONSTRAINT "drive_export_outbox_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "idx_drive_export_outbox_tenant_status"
  ON "public"."drive_export_outbox" ("tenant_id", "status");

-- 6. Google Calendar account (por usuario) ─────────────────────────────
CREATE TABLE IF NOT EXISTS "public"."google_calendar_accounts" (
  "id"                TEXT NOT NULL,
  "tenant_id"         TEXT NOT NULL,
  "user_id"           TEXT NOT NULL,
  "google_email"      TEXT NOT NULL,
  "access_token_enc"  TEXT NOT NULL,
  "refresh_token_enc" TEXT NOT NULL,
  "token_expires_at"  TIMESTAMP(3),
  "calendar_id"       TEXT NOT NULL DEFAULT 'primary',
  "prefs"             JSONB NOT NULL DEFAULT '{}',
  "status"            TEXT NOT NULL DEFAULT 'ACTIVE',
  "created_at"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"        TIMESTAMP(3) NOT NULL,
  CONSTRAINT "google_calendar_accounts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "uq_google_calendar_account_tenant_user"
  ON "public"."google_calendar_accounts" ("tenant_id", "user_id");
CREATE INDEX IF NOT EXISTS "idx_google_calendar_account_tenant"
  ON "public"."google_calendar_accounts" ("tenant_id");

-- 7. Agenda visitas ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "public"."agenda_visitas" (
  "id"              UUID NOT NULL DEFAULT uuid_generate_v4(),
  "tenant_id"       TEXT NOT NULL,
  "type"            TEXT NOT NULL,
  "title"           TEXT NOT NULL,
  "account_id"      UUID,
  "installation_id" UUID,
  "deal_id"         UUID,
  "assigned_user_id" TEXT NOT NULL,
  "start_at"        TIMESTAMPTZ(6) NOT NULL,
  "end_at"          TIMESTAMPTZ(6) NOT NULL,
  "notes"           TEXT,
  "contact_ids"     JSONB,
  "status"          TEXT NOT NULL DEFAULT 'programada',
  "result_note"     TEXT,
  "created_by"      TEXT NOT NULL,
  "created_at"      TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "updated_at"      TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "agenda_visitas_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "idx_agenda_visitas_tenant_start"
  ON "public"."agenda_visitas" ("tenant_id", "start_at");
CREATE INDEX IF NOT EXISTS "idx_agenda_visitas_tenant_assigned"
  ON "public"."agenda_visitas" ("tenant_id", "assigned_user_id");
CREATE INDEX IF NOT EXISTS "idx_agenda_visitas_deal"
  ON "public"."agenda_visitas" ("deal_id");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'agenda_visitas_account_id_fkey'
  ) THEN
    ALTER TABLE "public"."agenda_visitas"
      ADD CONSTRAINT "agenda_visitas_account_id_fkey"
      FOREIGN KEY ("account_id") REFERENCES "crm"."accounts" ("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'agenda_visitas_installation_id_fkey'
  ) THEN
    ALTER TABLE "public"."agenda_visitas"
      ADD CONSTRAINT "agenda_visitas_installation_id_fkey"
      FOREIGN KEY ("installation_id") REFERENCES "crm"."installations" ("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'agenda_visitas_deal_id_fkey'
  ) THEN
    ALTER TABLE "public"."agenda_visitas"
      ADD CONSTRAINT "agenda_visitas_deal_id_fkey"
      FOREIGN KEY ("deal_id") REFERENCES "crm"."deals" ("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- 8. Agenda event links (OPAI ↔ Google Calendar) ───────────────────────
CREATE TABLE IF NOT EXISTS "public"."agenda_event_links" (
  "id"                  TEXT NOT NULL,
  "tenant_id"           TEXT NOT NULL,
  "source_type"         TEXT NOT NULL,
  "source_id"           TEXT NOT NULL,
  "calendar_account_id" TEXT,
  "google_event_id"     TEXT,
  "google_calendar_id"  TEXT,
  "all_day"             BOOLEAN NOT NULL DEFAULT false,
  "sync_status"         TEXT NOT NULL DEFAULT 'PENDING',
  "last_error"          TEXT,
  "last_sync_at"        TIMESTAMP(3),
  "created_at"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"          TIMESTAMP(3) NOT NULL,
  CONSTRAINT "agenda_event_links_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "uq_agenda_event_link_source"
  ON "public"."agenda_event_links" ("source_type", "source_id");
CREATE INDEX IF NOT EXISTS "idx_agenda_event_link_tenant"
  ON "public"."agenda_event_links" ("tenant_id");
CREATE INDEX IF NOT EXISTS "idx_agenda_event_link_google_event"
  ON "public"."agenda_event_links" ("google_event_id");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'agenda_event_links_calendar_account_id_fkey'
  ) THEN
    ALTER TABLE "public"."agenda_event_links"
      ADD CONSTRAINT "agenda_event_links_calendar_account_id_fkey"
      FOREIGN KEY ("calendar_account_id") REFERENCES "public"."google_calendar_accounts" ("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
