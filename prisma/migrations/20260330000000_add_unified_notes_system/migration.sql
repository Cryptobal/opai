-- Unified Contextual Notes System
-- Creates the "notes" schema with all tables for the omnipresent notes feature.

CREATE SCHEMA IF NOT EXISTS "notes";

-- ── Enums ──

CREATE TYPE "notes"."NoteContextType" AS ENUM (
  'LEAD',
  'ACCOUNT',
  'INSTALLATION',
  'DEAL',
  'CONTACT',
  'QUOTATION',
  'GUARD',
  'DOCUMENT',
  'SHIFT',
  'REINFORCEMENT_SHIFT',
  'PAYROLL_RECORD',
  'INVOICE',
  'OPERATION',
  'SUPPLIER',
  'TICKET',
  'RENDICION',
  'PUESTO',
  'PAUTA_MENSUAL',
  'SUPERVISION_VISIT'
);

CREATE TYPE "notes"."NoteType" AS ENUM (
  'GENERAL',
  'ALERT',
  'DECISION',
  'TASK'
);

CREATE TYPE "notes"."MentionType" AS ENUM (
  'USER',
  'ALL',
  'ROLE'
);

CREATE TYPE "notes"."NoteVisibility" AS ENUM (
  'PUBLIC',
  'PRIVATE',
  'GROUP'
);

-- ── Notes (main table) ──

CREATE TABLE "notes"."notes" (
  "id"                UUID NOT NULL DEFAULT uuid_generate_v4(),
  "tenant_id"         TEXT NOT NULL,
  "context_type"      "notes"."NoteContextType" NOT NULL,
  "context_id"        TEXT NOT NULL,
  "author_id"         TEXT NOT NULL,
  "content"           TEXT NOT NULL,
  "content_html"      TEXT,
  "note_type"         "notes"."NoteType" NOT NULL DEFAULT 'GENERAL',
  "visibility"        "notes"."NoteVisibility" NOT NULL DEFAULT 'PUBLIC',
  "visible_to_users"  TEXT[] DEFAULT ARRAY[]::TEXT[],
  "parent_note_id"    UUID,
  "thread_depth"      INTEGER NOT NULL DEFAULT 0,
  "metadata"          JSONB,
  "attachments"       JSONB,
  "embedding"         DOUBLE PRECISION[] DEFAULT ARRAY[]::DOUBLE PRECISION[],
  "ai_summary"        TEXT,
  "ai_tags"           TEXT[] DEFAULT ARRAY[]::TEXT[],
  "ai_sentiment"      TEXT,
  "ai_relevant"       BOOLEAN NOT NULL DEFAULT true,
  "is_edited"         BOOLEAN NOT NULL DEFAULT false,
  "is_pinned"         BOOLEAN NOT NULL DEFAULT false,
  "deleted_at"        TIMESTAMPTZ(6),
  "deleted_by"        TEXT,
  "legacy_crm_note_id" UUID,
  "created_at"        TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"        TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "notes_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "notes_legacy_crm_note_id_key" ON "notes"."notes"("legacy_crm_note_id");
CREATE INDEX "idx_notes_tenant_context_created" ON "notes"."notes"("tenant_id", "context_type", "context_id", "created_at" DESC);
CREATE INDEX "idx_notes_tenant_author" ON "notes"."notes"("tenant_id", "author_id");
CREATE INDEX "idx_notes_tenant_parent" ON "notes"."notes"("tenant_id", "parent_note_id");
CREATE INDEX "idx_notes_tenant_type" ON "notes"."notes"("tenant_id", "note_type");
CREATE INDEX "idx_notes_tenant_context_visibility" ON "notes"."notes"("tenant_id", "context_type", "context_id", "visibility");
CREATE INDEX "idx_notes_tenant_pinned_context" ON "notes"."notes"("tenant_id", "is_pinned", "context_type", "context_id");
CREATE INDEX "idx_notes_tenant_soft_delete" ON "notes"."notes"("tenant_id", "deleted_at");

ALTER TABLE "notes"."notes"
  ADD CONSTRAINT "notes_author_id_fkey"
  FOREIGN KEY ("author_id") REFERENCES "public"."Admin"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "notes"."notes"
  ADD CONSTRAINT "notes_parent_note_id_fkey"
  FOREIGN KEY ("parent_note_id") REFERENCES "notes"."notes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── Note Mentions ──

CREATE TABLE "notes"."note_mentions" (
  "id"                UUID NOT NULL DEFAULT uuid_generate_v4(),
  "tenant_id"         TEXT NOT NULL,
  "note_id"           UUID NOT NULL,
  "mention_type"      "notes"."MentionType" NOT NULL,
  "mentioned_user_id" TEXT,
  "mentioned_role"    TEXT,
  "is_read"           BOOLEAN NOT NULL DEFAULT false,
  "read_at"           TIMESTAMPTZ(6),
  "notification_sent" BOOLEAN NOT NULL DEFAULT false,
  "created_at"        TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "note_mentions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "idx_note_mentions_user_read" ON "notes"."note_mentions"("tenant_id", "mentioned_user_id", "is_read");
CREATE INDEX "idx_note_mentions_note" ON "notes"."note_mentions"("tenant_id", "note_id");

ALTER TABLE "notes"."note_mentions"
  ADD CONSTRAINT "note_mentions_note_id_fkey"
  FOREIGN KEY ("note_id") REFERENCES "notes"."notes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── Note Read Statuses ──

CREATE TABLE "notes"."note_read_statuses" (
  "id"           UUID NOT NULL DEFAULT uuid_generate_v4(),
  "tenant_id"    TEXT NOT NULL,
  "user_id"      TEXT NOT NULL,
  "context_type" "notes"."NoteContextType",
  "context_id"   TEXT,
  "note_id"      UUID,
  "last_read_at" TIMESTAMPTZ(6) NOT NULL,

  CONSTRAINT "note_read_statuses_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "uq_note_read_status_user_context" ON "notes"."note_read_statuses"("tenant_id", "user_id", "context_type", "context_id");
CREATE INDEX "idx_note_read_status_user" ON "notes"."note_read_statuses"("tenant_id", "user_id");

ALTER TABLE "notes"."note_read_statuses"
  ADD CONSTRAINT "note_read_statuses_note_id_fkey"
  FOREIGN KEY ("note_id") REFERENCES "notes"."notes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── Note Reactions ──

CREATE TABLE "notes"."note_reactions" (
  "id"         UUID NOT NULL DEFAULT uuid_generate_v4(),
  "tenant_id"  TEXT NOT NULL,
  "note_id"    UUID NOT NULL,
  "user_id"    TEXT NOT NULL,
  "emoji"      TEXT NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "note_reactions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "uq_note_reaction_user_emoji" ON "notes"."note_reactions"("tenant_id", "note_id", "user_id", "emoji");
CREATE INDEX "idx_note_reactions_note" ON "notes"."note_reactions"("tenant_id", "note_id");

ALTER TABLE "notes"."note_reactions"
  ADD CONSTRAINT "note_reactions_note_id_fkey"
  FOREIGN KEY ("note_id") REFERENCES "notes"."notes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── Note Entity References ──

CREATE TABLE "notes"."note_entity_references" (
  "id"                      UUID NOT NULL DEFAULT uuid_generate_v4(),
  "tenant_id"               TEXT NOT NULL,
  "note_id"                 UUID NOT NULL,
  "referenced_entity_type"  "notes"."NoteContextType" NOT NULL,
  "referenced_entity_id"    TEXT NOT NULL,
  "referenced_entity_label" TEXT NOT NULL,
  "referenced_entity_code"  TEXT,
  "created_at"              TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "note_entity_references_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "idx_note_entity_refs_note" ON "notes"."note_entity_references"("tenant_id", "note_id");
CREATE INDEX "idx_note_entity_refs_entity" ON "notes"."note_entity_references"("tenant_id", "referenced_entity_type", "referenced_entity_id");

ALTER TABLE "notes"."note_entity_references"
  ADD CONSTRAINT "note_entity_references_note_id_fkey"
  FOREIGN KEY ("note_id") REFERENCES "notes"."notes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── Entity Followers ──

CREATE TABLE "notes"."entity_followers" (
  "id"                UUID NOT NULL DEFAULT uuid_generate_v4(),
  "tenant_id"         TEXT NOT NULL,
  "user_id"           TEXT NOT NULL,
  "context_type"      "notes"."NoteContextType" NOT NULL,
  "context_id"        TEXT NOT NULL,
  "auto_follow"       BOOLEAN NOT NULL DEFAULT true,
  "notify_on_all"     BOOLEAN NOT NULL DEFAULT true,
  "notify_on_mention" BOOLEAN NOT NULL DEFAULT true,
  "notify_on_alert"   BOOLEAN NOT NULL DEFAULT true,
  "created_at"        TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "entity_followers_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "uq_entity_follower_user_context" ON "notes"."entity_followers"("tenant_id", "user_id", "context_type", "context_id");
CREATE INDEX "idx_entity_followers_context" ON "notes"."entity_followers"("tenant_id", "context_type", "context_id");
CREATE INDEX "idx_entity_followers_user" ON "notes"."entity_followers"("tenant_id", "user_id");

-- ── AI Context Summaries ──

CREATE TABLE "notes"."ai_context_summaries" (
  "id"            UUID NOT NULL DEFAULT uuid_generate_v4(),
  "tenant_id"     TEXT NOT NULL,
  "context_type"  "notes"."NoteContextType" NOT NULL,
  "context_id"    TEXT NOT NULL,
  "summary"       TEXT NOT NULL,
  "period_start"  TIMESTAMPTZ(6) NOT NULL,
  "period_end"    TIMESTAMPTZ(6) NOT NULL,
  "note_count"    INTEGER NOT NULL,
  "topics"        TEXT[] DEFAULT ARRAY[]::TEXT[],
  "decisions"     JSONB,
  "pending_tasks" JSONB,
  "embedding"     DOUBLE PRECISION[] DEFAULT ARRAY[]::DOUBLE PRECISION[],
  "created_at"    TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"    TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ai_context_summaries_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "idx_ai_context_summaries_context" ON "notes"."ai_context_summaries"("tenant_id", "context_type", "context_id");
CREATE INDEX "idx_ai_context_summaries_period" ON "notes"."ai_context_summaries"("tenant_id", "period_end" DESC);
