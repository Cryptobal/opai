-- ──────────────────────────────────────────────────────────────────────
-- Tareas v2: prioridad + bitácora de seguimiento (ADITIVA).
--
--   1. crm.tasks.priority — "high"|"medium"|"low"|null (sin prioridad).
--   2. crm.task_activity  — eventos de producto + comentarios por tarea.
--
-- Idempotente. Sin backfill. Cascade al borrar la tarea.
-- ──────────────────────────────────────────────────────────────────────

ALTER TABLE "crm"."tasks"
  ADD COLUMN IF NOT EXISTS "priority" TEXT;

CREATE TABLE IF NOT EXISTS "crm"."task_activity" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "task_id" UUID NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "payload" JSONB,
    "message" TEXT,
    "actor_id" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "task_activity_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "idx_crm_task_activity_task_created"
  ON "crm"."task_activity" ("task_id", "created_at");

CREATE INDEX IF NOT EXISTS "idx_crm_task_activity_tenant"
  ON "crm"."task_activity" ("tenant_id");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'task_activity_task_id_fkey'
  ) THEN
    ALTER TABLE "crm"."task_activity"
      ADD CONSTRAINT "task_activity_task_id_fkey"
      FOREIGN KEY ("task_id") REFERENCES "crm"."tasks"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
