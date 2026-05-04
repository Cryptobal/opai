-- Client Onboarding Playbook (post-won)
-- Adds: onboarding_playbooks, onboarding_playbook_steps,
--       client_onboardings, client_onboarding_steps

-- ── onboarding_playbooks ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "ops"."onboarding_playbooks" (
  "id"          UUID         NOT NULL DEFAULT uuid_generate_v4(),
  "tenant_id"   TEXT         NOT NULL,
  "name"        TEXT         NOT NULL,
  "version"     INTEGER      NOT NULL DEFAULT 1,
  "is_default"  BOOLEAN      NOT NULL DEFAULT false,
  "is_active"   BOOLEAN      NOT NULL DEFAULT true,
  "description" TEXT,
  "created_at"  TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"  TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "onboarding_playbooks_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "uq_onboarding_playbooks_tenant_name_version"
  ON "ops"."onboarding_playbooks" ("tenant_id", "name", "version");
CREATE INDEX IF NOT EXISTS "idx_onboarding_playbooks_tenant"
  ON "ops"."onboarding_playbooks" ("tenant_id");
CREATE INDEX IF NOT EXISTS "idx_onboarding_playbooks_tenant_default"
  ON "ops"."onboarding_playbooks" ("tenant_id", "is_default");

-- ── onboarding_playbook_steps ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "ops"."onboarding_playbook_steps" (
  "id"                       UUID         NOT NULL DEFAULT uuid_generate_v4(),
  "playbook_id"              UUID         NOT NULL,
  "phase"                    INTEGER      NOT NULL,
  "sort_order"               INTEGER      NOT NULL,
  "slug"                     TEXT         NOT NULL,
  "title"                    TEXT         NOT NULL,
  "description"              TEXT,
  "ticket_type_slug"         TEXT         NOT NULL,
  "default_assigned_team"    TEXT         NOT NULL,
  "default_assigned_user_id" TEXT,
  "default_priority"         TEXT         NOT NULL DEFAULT 'p3',
  "due_date_offset_days"     INTEGER      NOT NULL,
  "default_applies"          BOOLEAN      NOT NULL DEFAULT true,
  "created_at"               TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"               TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "onboarding_playbook_steps_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "uq_onboarding_playbook_steps_playbook_slug"
  ON "ops"."onboarding_playbook_steps" ("playbook_id", "slug");
CREATE INDEX IF NOT EXISTS "idx_onboarding_playbook_steps_order"
  ON "ops"."onboarding_playbook_steps" ("playbook_id", "phase", "sort_order");

ALTER TABLE "ops"."onboarding_playbook_steps"
  ADD CONSTRAINT "onboarding_playbook_steps_playbook_id_fkey"
  FOREIGN KEY ("playbook_id") REFERENCES "ops"."onboarding_playbooks"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- ── client_onboardings ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "ops"."client_onboardings" (
  "id"                  UUID         NOT NULL DEFAULT uuid_generate_v4(),
  "tenant_id"           TEXT         NOT NULL,
  "account_id"          UUID         NOT NULL,
  "installation_id"     UUID,
  "deal_id"             UUID,
  "playbook_id"         UUID         NOT NULL,
  "service_start_date"  DATE         NOT NULL,
  "status"              TEXT         NOT NULL DEFAULT 'in_progress',
  "started_at"          TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completed_at"        TIMESTAMPTZ(6),
  "notes"               TEXT,
  "created_by"          TEXT         NOT NULL,
  "created_at"          TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"          TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "client_onboardings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "client_onboardings_deal_id_key"
  ON "ops"."client_onboardings" ("deal_id");
CREATE INDEX IF NOT EXISTS "idx_client_onboardings_tenant_status"
  ON "ops"."client_onboardings" ("tenant_id", "status");
CREATE INDEX IF NOT EXISTS "idx_client_onboardings_account"
  ON "ops"."client_onboardings" ("account_id");
CREATE INDEX IF NOT EXISTS "idx_client_onboardings_installation"
  ON "ops"."client_onboardings" ("installation_id");

ALTER TABLE "ops"."client_onboardings"
  ADD CONSTRAINT "client_onboardings_playbook_id_fkey"
  FOREIGN KEY ("playbook_id") REFERENCES "ops"."onboarding_playbooks"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- ── client_onboarding_steps ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "ops"."client_onboarding_steps" (
  "id"               UUID         NOT NULL DEFAULT uuid_generate_v4(),
  "onboarding_id"    UUID         NOT NULL,
  "playbook_step_id" UUID,
  "ticket_id"        UUID,
  "is_custom"        BOOLEAN      NOT NULL DEFAULT false,
  "title"            TEXT         NOT NULL,
  "status"           TEXT         NOT NULL DEFAULT 'open',
  "skipped_reason"   TEXT,
  "resolved_at"      TIMESTAMPTZ(6),
  "created_at"       TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"       TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "client_onboarding_steps_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "client_onboarding_steps_ticket_id_key"
  ON "ops"."client_onboarding_steps" ("ticket_id");
CREATE INDEX IF NOT EXISTS "idx_client_onboarding_steps_onboarding"
  ON "ops"."client_onboarding_steps" ("onboarding_id");
CREATE INDEX IF NOT EXISTS "idx_client_onboarding_steps_ticket"
  ON "ops"."client_onboarding_steps" ("ticket_id");

ALTER TABLE "ops"."client_onboarding_steps"
  ADD CONSTRAINT "client_onboarding_steps_onboarding_id_fkey"
  FOREIGN KEY ("onboarding_id") REFERENCES "ops"."client_onboardings"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
