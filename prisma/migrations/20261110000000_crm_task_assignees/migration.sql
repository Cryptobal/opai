-- ──────────────────────────────────────────────────────────────────────
-- Tareas multi-responsable + trazabilidad de completado (ADITIVA).
--
--   1. crm.tasks.completed_by / completed_at — quién y cuándo completó.
--   2. crm.task_assignees                    — N responsables por tarea.
--   3. Backfill: cada tarea con assigned_to genera su fila de responsable.
--
-- No se elimina crm.tasks.assigned_to: se conserva como denormalización de
-- compatibilidad (= primer responsable) para consumidores móviles y queries
-- existentes. Migración estrictamente aditiva.
-- ──────────────────────────────────────────────────────────────────────

ALTER TABLE "crm"."tasks"
  ADD COLUMN IF NOT EXISTS "completed_by" TEXT;

ALTER TABLE "crm"."tasks"
  ADD COLUMN IF NOT EXISTS "completed_at" TIMESTAMPTZ(6);

CREATE TABLE IF NOT EXISTS "crm"."task_assignees" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "task_id" UUID NOT NULL,
    "user_id" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "task_assignees_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "uq_crm_task_assignees_task_user"
  ON "crm"."task_assignees" ("task_id", "user_id");

CREATE INDEX IF NOT EXISTS "idx_crm_task_assignees_task"
  ON "crm"."task_assignees" ("task_id");

CREATE INDEX IF NOT EXISTS "idx_crm_task_assignees_user"
  ON "crm"."task_assignees" ("user_id");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'task_assignees_task_id_fkey'
  ) THEN
    ALTER TABLE "crm"."task_assignees"
      ADD CONSTRAINT "task_assignees_task_id_fkey"
      FOREIGN KEY ("task_id") REFERENCES "crm"."tasks"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- Backfill idempotente del responsable principal existente.
INSERT INTO "crm"."task_assignees" ("task_id", "user_id")
SELECT "id", "assigned_to"
FROM "crm"."tasks"
WHERE "assigned_to" IS NOT NULL
ON CONFLICT DO NOTHING;
