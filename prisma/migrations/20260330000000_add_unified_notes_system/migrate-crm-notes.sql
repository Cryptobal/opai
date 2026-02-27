-- Data Migration: CrmNote (crm.notes) → Note (notes.notes)
--
-- Preserves: id, tenant, author, content, timestamps, threads, mentions.
-- Maps entityType to NoteContextType enum.
-- All existing notes get visibility = PUBLIC, noteType = GENERAL.
--
-- Run AFTER the schema migration (migration.sql).
-- This is idempotent: skips rows where legacy_crm_note_id already exists.

-- ═══════════════════════════════════════════════════════════════════════════════
-- STEP 1: Migrate root notes (parentId IS NULL)
-- ═══════════════════════════════════════════════════════════════════════════════

INSERT INTO "notes"."notes" (
  "id",
  "tenant_id",
  "context_type",
  "context_id",
  "author_id",
  "content",
  "note_type",
  "visibility",
  "visible_to_users",
  "parent_note_id",
  "thread_depth",
  "metadata",
  "is_edited",
  "is_pinned",
  "legacy_crm_note_id",
  "created_at",
  "updated_at"
)
SELECT
  uuid_generate_v4(),
  cn."tenant_id",
  CASE cn."entity_type"
    WHEN 'account'            THEN 'ACCOUNT'::"notes"."NoteContextType"
    WHEN 'contact'            THEN 'CONTACT'::"notes"."NoteContextType"
    WHEN 'deal'               THEN 'DEAL'::"notes"."NoteContextType"
    WHEN 'quote'              THEN 'QUOTATION'::"notes"."NoteContextType"
    WHEN 'installation'       THEN 'INSTALLATION'::"notes"."NoteContextType"
    WHEN 'ops_guardia'        THEN 'GUARD'::"notes"."NoteContextType"
    WHEN 'installation_pauta' THEN 'PAUTA_MENSUAL'::"notes"."NoteContextType"
    ELSE                           'LEAD'::"notes"."NoteContextType"
  END,
  cn."entity_id",
  cn."created_by",
  cn."content",
  'GENERAL'::"notes"."NoteType",
  'PUBLIC'::"notes"."NoteVisibility",
  ARRAY[]::TEXT[],
  NULL,                   -- root notes have no parent
  0,                      -- root depth
  CASE
    WHEN cn."mention_meta" IS NOT NULL
    THEN jsonb_build_object(
      'legacyMentionMeta', cn."mention_meta",
      'legacyMentions', to_jsonb(cn."mentions")
    )
    WHEN array_length(cn."mentions", 1) > 0
    THEN jsonb_build_object('legacyMentions', to_jsonb(cn."mentions"))
    ELSE NULL
  END,
  false,
  false,
  cn."id",               -- preserve link to original
  cn."created_at",
  cn."updated_at"
FROM "crm"."notes" cn
WHERE cn."parent_id" IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM "notes"."notes" n WHERE n."legacy_crm_note_id" = cn."id"
  );

-- ═══════════════════════════════════════════════════════════════════════════════
-- STEP 2: Migrate reply notes (parentId IS NOT NULL)
-- Must run after root notes so parent lookup works.
-- ═══════════════════════════════════════════════════════════════════════════════

INSERT INTO "notes"."notes" (
  "id",
  "tenant_id",
  "context_type",
  "context_id",
  "author_id",
  "content",
  "note_type",
  "visibility",
  "visible_to_users",
  "parent_note_id",
  "thread_depth",
  "metadata",
  "is_edited",
  "is_pinned",
  "legacy_crm_note_id",
  "created_at",
  "updated_at"
)
SELECT
  uuid_generate_v4(),
  cn."tenant_id",
  CASE cn."entity_type"
    WHEN 'account'            THEN 'ACCOUNT'::"notes"."NoteContextType"
    WHEN 'contact'            THEN 'CONTACT'::"notes"."NoteContextType"
    WHEN 'deal'               THEN 'DEAL'::"notes"."NoteContextType"
    WHEN 'quote'              THEN 'QUOTATION'::"notes"."NoteContextType"
    WHEN 'installation'       THEN 'INSTALLATION'::"notes"."NoteContextType"
    WHEN 'ops_guardia'        THEN 'GUARD'::"notes"."NoteContextType"
    WHEN 'installation_pauta' THEN 'PAUTA_MENSUAL'::"notes"."NoteContextType"
    ELSE                           'LEAD'::"notes"."NoteContextType"
  END,
  cn."entity_id",
  cn."created_by",
  cn."content",
  'GENERAL'::"notes"."NoteType",
  'PUBLIC'::"notes"."NoteVisibility",
  ARRAY[]::TEXT[],
  parent_new."id",        -- FK to migrated parent
  1,                      -- reply depth
  CASE
    WHEN cn."mention_meta" IS NOT NULL
    THEN jsonb_build_object(
      'legacyMentionMeta', cn."mention_meta",
      'legacyMentions', to_jsonb(cn."mentions")
    )
    WHEN array_length(cn."mentions", 1) > 0
    THEN jsonb_build_object('legacyMentions', to_jsonb(cn."mentions"))
    ELSE NULL
  END,
  false,
  false,
  cn."id",
  cn."created_at",
  cn."updated_at"
FROM "crm"."notes" cn
INNER JOIN "notes"."notes" parent_new
  ON parent_new."legacy_crm_note_id" = cn."parent_id"
WHERE cn."parent_id" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM "notes"."notes" n WHERE n."legacy_crm_note_id" = cn."id"
  );

-- ═══════════════════════════════════════════════════════════════════════════════
-- STEP 3: Migrate mentions into NoteMention table
-- Creates one NoteMention row per mentioned user per note.
-- ═══════════════════════════════════════════════════════════════════════════════

INSERT INTO "notes"."note_mentions" (
  "id",
  "tenant_id",
  "note_id",
  "mention_type",
  "mentioned_user_id",
  "is_read",
  "notification_sent",
  "created_at"
)
SELECT
  uuid_generate_v4(),
  nn."tenant_id",
  nn."id",
  'USER'::"notes"."MentionType",
  mention_id,
  true,                   -- legacy mentions already notified
  true,                   -- already sent
  nn."created_at"
FROM "notes"."notes" nn
INNER JOIN "crm"."notes" cn ON cn."id" = nn."legacy_crm_note_id"
CROSS JOIN LATERAL unnest(cn."mentions") AS mention_id
WHERE nn."legacy_crm_note_id" IS NOT NULL
  AND array_length(cn."mentions", 1) > 0
  AND NOT EXISTS (
    SELECT 1 FROM "notes"."note_mentions" nm
    WHERE nm."note_id" = nn."id" AND nm."mentioned_user_id" = mention_id
  );

-- Also handle @all mentions (from mentionMeta)
INSERT INTO "notes"."note_mentions" (
  "id",
  "tenant_id",
  "note_id",
  "mention_type",
  "is_read",
  "notification_sent",
  "created_at"
)
SELECT
  uuid_generate_v4(),
  nn."tenant_id",
  nn."id",
  'ALL'::"notes"."MentionType",
  true,
  true,
  nn."created_at"
FROM "notes"."notes" nn
INNER JOIN "crm"."notes" cn ON cn."id" = nn."legacy_crm_note_id"
WHERE nn."legacy_crm_note_id" IS NOT NULL
  AND cn."mention_meta" IS NOT NULL
  AND (cn."mention_meta"->>'mentionAll')::boolean = true
  AND NOT EXISTS (
    SELECT 1 FROM "notes"."note_mentions" nm
    WHERE nm."note_id" = nn."id" AND nm."mention_type" = 'ALL'::"notes"."MentionType"
  );

-- ═══════════════════════════════════════════════════════════════════════════════
-- STEP 4: Verify migration counts
-- ═══════════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_legacy_count   BIGINT;
  v_migrated_count BIGINT;
BEGIN
  SELECT count(*) INTO v_legacy_count FROM "crm"."notes";
  SELECT count(*) INTO v_migrated_count FROM "notes"."notes" WHERE "legacy_crm_note_id" IS NOT NULL;

  RAISE NOTICE 'Migration complete: % legacy notes → % migrated notes', v_legacy_count, v_migrated_count;

  IF v_legacy_count <> v_migrated_count THEN
    RAISE WARNING 'Count mismatch! Expected %, got %. Some notes may have invalid author references.', v_legacy_count, v_migrated_count;
  END IF;
END $$;
