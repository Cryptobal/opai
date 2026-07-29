-- Copiloto Correos v4: columnas de espera (SLA) en hilos de correo.
-- Aditivo e idempotente. Backfill desde mensajes no-draft.

ALTER TABLE "crm"."email_threads"
  ADD COLUMN IF NOT EXISTS "last_inbound_at" TIMESTAMPTZ(6),
  ADD COLUMN IF NOT EXISTS "last_outbound_at" TIMESTAMPTZ(6);

UPDATE "crm"."email_threads" AS t
SET
  last_inbound_at = agg.i,
  last_outbound_at = agg.o
FROM (
  SELECT
    thread_id,
    MAX(sent_at) FILTER (WHERE direction = 'in') AS i,
    MAX(sent_at) FILTER (WHERE direction = 'out') AS o
  FROM "crm"."email_messages"
  WHERE is_draft = false
  GROUP BY thread_id
) AS agg
WHERE t.id = agg.thread_id;
