-- Gmail realtime: cola coalescente por casilla + garantías de idempotencia.
-- La migración conserva el hilo más antiguo de cada par account/provider y
-- repunta sus referencias antes de crear los índices únicos.

-- 1) Consolidar metadata útil en el hilo canónico.
WITH grouped AS (
  SELECT
    "email_account_id",
    "provider_thread_id",
    (array_agg("id" ORDER BY "created_at", "id"))[1] AS keep_id,
    (array_agg("account_id" ORDER BY "created_at") FILTER (WHERE "account_id" IS NOT NULL))[1] AS account_id,
    (array_agg("contact_id" ORDER BY "created_at") FILTER (WHERE "contact_id" IS NOT NULL))[1] AS contact_id,
    (array_agg("deal_id" ORDER BY "created_at") FILTER (WHERE "deal_id" IS NOT NULL))[1] AS deal_id,
    (array_agg("lead_id" ORDER BY "created_at") FILTER (WHERE "lead_id" IS NOT NULL))[1] AS lead_id,
    MAX("last_message_at") AS last_message_at,
    MAX("attachment_count") AS attachment_count,
    (array_agg("archived_at" ORDER BY "updated_at" DESC, "id" DESC))[1] AS archived_at,
    (array_agg("trashed_at" ORDER BY "updated_at" DESC, "id" DESC))[1] AS trashed_at,
    (array_agg("spam_at" ORDER BY "updated_at" DESC, "id" DESC))[1] AS spam_at,
    (array_agg("is_unread" ORDER BY "updated_at" DESC, "id" DESC))[1] AS is_unread,
    (array_agg("snoozed_until" ORDER BY "updated_at" DESC, "id" DESC))[1] AS snoozed_until,
    (array_agg("ai_category" ORDER BY "ai_classified_at" DESC NULLS LAST, "updated_at" DESC)
      FILTER (WHERE "ai_category" IS NOT NULL))[1] AS ai_category,
    (array_agg("ai_intent" ORDER BY "ai_classified_at" DESC NULLS LAST, "updated_at" DESC)
      FILTER (WHERE "ai_intent" IS NOT NULL))[1] AS ai_intent,
    (array_agg("ai_summary" ORDER BY "ai_classified_at" DESC NULLS LAST, "updated_at" DESC)
      FILTER (WHERE "ai_summary" IS NOT NULL))[1] AS ai_summary,
    MAX("ai_classified_at") AS ai_classified_at,
    MIN("first_inbound_at") AS first_inbound_at,
    MIN("first_reply_at") AS first_reply_at
  FROM "crm"."email_threads"
  WHERE "email_account_id" IS NOT NULL
    AND "provider_thread_id" IS NOT NULL
  GROUP BY "email_account_id", "provider_thread_id"
  HAVING COUNT(*) > 1
)
UPDATE "crm"."email_threads" AS target
SET
  "account_id" = COALESCE(target."account_id", grouped.account_id),
  "contact_id" = COALESCE(target."contact_id", grouped.contact_id),
  "deal_id" = COALESCE(target."deal_id", grouped.deal_id),
  "lead_id" = COALESCE(target."lead_id", grouped.lead_id),
  "last_message_at" = grouped.last_message_at,
  "attachment_count" = grouped.attachment_count,
  "archived_at" = grouped.archived_at,
  "trashed_at" = grouped.trashed_at,
  "spam_at" = grouped.spam_at,
  "is_unread" = grouped.is_unread,
  "snoozed_until" = grouped.snoozed_until,
  "ai_category" = grouped.ai_category,
  "ai_intent" = grouped.ai_intent,
  "ai_summary" = grouped.ai_summary,
  "ai_classified_at" = grouped.ai_classified_at,
  "first_inbound_at" = grouped.first_inbound_at,
  "first_reply_at" = grouped.first_reply_at
FROM grouped
WHERE target."id" = grouped.keep_id;

-- 2) Reapuntar mensajes, tareas y radar al hilo canónico.
WITH ranked AS (
  SELECT
    "id",
    (array_agg("id") OVER (
      PARTITION BY "email_account_id", "provider_thread_id"
      ORDER BY "created_at", "id"
      ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING
    ))[1] AS keep_id,
    ROW_NUMBER() OVER (
      PARTITION BY "email_account_id", "provider_thread_id"
      ORDER BY "created_at", "id"
    ) AS rn
  FROM "crm"."email_threads"
  WHERE "email_account_id" IS NOT NULL
    AND "provider_thread_id" IS NOT NULL
)
UPDATE "crm"."email_messages" AS message
SET "thread_id" = ranked.keep_id
FROM ranked
WHERE ranked.rn > 1
  AND message."thread_id" = ranked.id;

WITH ranked AS (
  SELECT
    "id",
    (array_agg("id") OVER (
      PARTITION BY "email_account_id", "provider_thread_id"
      ORDER BY "created_at", "id"
      ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING
    ))[1] AS keep_id,
    ROW_NUMBER() OVER (
      PARTITION BY "email_account_id", "provider_thread_id"
      ORDER BY "created_at", "id"
    ) AS rn
  FROM "crm"."email_threads"
  WHERE "email_account_id" IS NOT NULL
    AND "provider_thread_id" IS NOT NULL
)
UPDATE "crm"."tasks" AS task
SET "email_thread_id" = ranked.keep_id
FROM ranked
WHERE ranked.rn > 1
  AND task."email_thread_id" = ranked.id;

WITH ranked AS (
  SELECT
    "id",
    (array_agg("id") OVER (
      PARTITION BY "email_account_id", "provider_thread_id"
      ORDER BY "created_at", "id"
      ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING
    ))[1] AS keep_id,
    ROW_NUMBER() OVER (
      PARTITION BY "email_account_id", "provider_thread_id"
      ORDER BY "created_at", "id"
    ) AS rn
  FROM "crm"."email_threads"
  WHERE "email_account_id" IS NOT NULL
    AND "provider_thread_id" IS NOT NULL
)
UPDATE "crm"."radar_items" AS item
SET "thread_id" = ranked.keep_id::text
FROM ranked
WHERE ranked.rn > 1
  AND item."thread_id" = ranked.id::text;

WITH ranked AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (
      PARTITION BY "email_account_id", "provider_thread_id"
      ORDER BY "created_at", "id"
    ) AS rn
  FROM "crm"."email_threads"
  WHERE "email_account_id" IS NOT NULL
    AND "provider_thread_id" IS NOT NULL
)
DELETE FROM "crm"."email_threads" AS thread
USING ranked
WHERE thread."id" = ranked.id
  AND ranked.rn > 1;

-- 3) Deduplicar mensajes Gmail ya consolidados. Primero se reapuntan las
-- referencias blandas de follow-up para no dejar UUIDs huérfanos.
WITH ranked AS (
  SELECT
    "id",
    FIRST_VALUE("id") OVER (
      PARTITION BY "email_account_id", "provider_message_id"
      ORDER BY
        CASE WHEN "html_body" IS NOT NULL OR "text_body" IS NOT NULL THEN 0 ELSE 1 END,
        CASE WHEN "followup_log_id" IS NOT NULL THEN 0 ELSE 1 END,
        "created_at",
        "id"
    ) AS keep_id,
    ROW_NUMBER() OVER (
      PARTITION BY "email_account_id", "provider_message_id"
      ORDER BY
        CASE WHEN "html_body" IS NOT NULL OR "text_body" IS NOT NULL THEN 0 ELSE 1 END,
        CASE WHEN "followup_log_id" IS NOT NULL THEN 0 ELSE 1 END,
        "created_at",
        "id"
    ) AS rn
  FROM "crm"."email_messages"
  WHERE "email_account_id" IS NOT NULL
    AND "provider_message_id" IS NOT NULL
),
merged AS (
  SELECT
    ranked.keep_id,
    (array_agg(message."followup_log_id" ORDER BY
      (message."followup_log_id" IS NULL),
      message."created_at",
      message."id"
    ))[1] AS followup_log_id
  FROM ranked
  JOIN "crm"."email_messages" AS message ON message."id" = ranked."id"
  GROUP BY ranked.keep_id
),
preserved AS (
  UPDATE "crm"."email_messages" AS target
  SET "followup_log_id" = COALESCE(
    target."followup_log_id",
    merged.followup_log_id
  )
  FROM merged
  WHERE target."id" = merged.keep_id
  RETURNING target."id"
)
UPDATE "crm"."crm_followup_logs" AS followup
SET "email_message_id" = ranked.keep_id
FROM ranked
WHERE ranked.rn > 1
  AND followup."email_message_id" = ranked.id;

WITH ranked AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (
      PARTITION BY "email_account_id", "provider_message_id"
      ORDER BY
        CASE WHEN "html_body" IS NOT NULL OR "text_body" IS NOT NULL THEN 0 ELSE 1 END,
        CASE WHEN "followup_log_id" IS NOT NULL THEN 0 ELSE 1 END,
        "created_at",
        "id"
    ) AS rn
  FROM "crm"."email_messages"
  WHERE "email_account_id" IS NOT NULL
    AND "provider_message_id" IS NOT NULL
)
DELETE FROM "crm"."email_messages" AS message
USING ranked
WHERE message."id" = ranked.id
  AND ranked.rn > 1;

DROP INDEX IF EXISTS "crm"."idx_crm_email_threads_account_provider";
CREATE UNIQUE INDEX IF NOT EXISTS "uq_crm_email_threads_account_provider"
  ON "crm"."email_threads" ("email_account_id", "provider_thread_id");

CREATE UNIQUE INDEX IF NOT EXISTS "uq_crm_email_messages_account_provider"
  ON "crm"."email_messages" ("email_account_id", "provider_message_id");

-- 4) Cola/lease singleton por casilla. Un push durante una corrida vuelve a
-- marcar pending=true sin invalidar el lease activo.
CREATE TABLE IF NOT EXISTS "crm"."gmail_sync_jobs" (
  "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
  "tenant_id" TEXT NOT NULL,
  "email_account_id" UUID NOT NULL,
  "pending" BOOLEAN NOT NULL DEFAULT true,
  "maintenance_requested" BOOLEAN NOT NULL DEFAULT false,
  "reason" TEXT NOT NULL DEFAULT 'push',
  "requested_history_id" TEXT,
  "requested_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "available_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "lease_token" TEXT,
  "lease_until" TIMESTAMPTZ(6),
  "last_started_at" TIMESTAMPTZ(6),
  "last_completed_at" TIMESTAMPTZ(6),
  "last_error" TEXT,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "gmail_sync_jobs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "uq_crm_gmail_sync_jobs_account" UNIQUE ("email_account_id"),
  CONSTRAINT "gmail_sync_jobs_email_account_id_fkey"
    FOREIGN KEY ("email_account_id")
    REFERENCES "crm"."email_accounts"("id")
    ON DELETE CASCADE
    ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "idx_crm_gmail_sync_jobs_due"
  ON "crm"."gmail_sync_jobs" ("pending", "available_at");
CREATE INDEX IF NOT EXISTS "idx_crm_gmail_sync_jobs_lease"
  ON "crm"."gmail_sync_jobs" ("lease_until");
CREATE INDEX IF NOT EXISTS "idx_crm_gmail_sync_jobs_tenant"
  ON "crm"."gmail_sync_jobs" ("tenant_id");
