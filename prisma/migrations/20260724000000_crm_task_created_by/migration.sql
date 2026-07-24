-- Trazabilidad de creador en tareas (solo el creador o owner/admin puede eliminar).
ALTER TABLE "crm"."tasks" ADD COLUMN IF NOT EXISTS "created_by" TEXT;

-- Backfill conservador: tareas huérfanas quedan sin creador (solo admin puede borrarlas).
UPDATE "crm"."tasks" SET "created_by" = "assigned_to"
WHERE "created_by" IS NULL AND "assigned_to" IS NOT NULL;
