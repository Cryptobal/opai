-- Knowledge recurring exams v2: días + tracking + dispatch run audit
-- Generado a mano (Prisma shadow DB no soporta multi-schema en Neon).
-- Aditivo puro: sólo ADD COLUMN, CREATE TABLE, CREATE INDEX, ADD FK.

-- AlterTable: 8 columnas en exam_assignments
ALTER TABLE "crm"."exam_assignments"
  ADD COLUMN "dispatch_run_id" TEXT,
  ADD COLUMN "due_at" TIMESTAMPTZ(6),
  ADD COLUMN "notification_error" TEXT,
  ADD COLUMN "notification_sent_at" TIMESTAMPTZ(6),
  ADD COLUMN "notification_status" TEXT NOT NULL DEFAULT 'pending',
  ADD COLUMN "reminder_sent_at" TIMESTAMPTZ(6),
  ADD COLUMN "trigger" TEXT NOT NULL DEFAULT 'manual',
  ADD COLUMN "triggered_by_user_id" TEXT;

-- AlterTable: días en exams (recurring_months queda como deprecated/fallback)
ALTER TABLE "crm"."exams"
  ADD COLUMN "recurring_days" INTEGER;

-- CreateTable: resumen auditable por corrida del cron
CREATE TABLE "crm"."exam_recurring_dispatch_runs" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "started_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMPTZ(6),
    "exam_id" TEXT,
    "exams_processed" INTEGER NOT NULL DEFAULT 0,
    "assignments_created" INTEGER NOT NULL DEFAULT 0,
    "emails_sent" INTEGER NOT NULL DEFAULT 0,
    "emails_failed" INTEGER NOT NULL DEFAULT 0,
    "emails_skipped" INTEGER NOT NULL DEFAULT 0,
    "errors" JSONB,
    "trigger_source" TEXT NOT NULL DEFAULT 'cron',

    CONSTRAINT "exam_recurring_dispatch_runs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: dispatch run lookups
CREATE INDEX "idx_dispatch_run_tenant_started" ON "crm"."exam_recurring_dispatch_runs"("tenant_id", "started_at" DESC);
CREATE INDEX "idx_dispatch_run_exam_started"   ON "crm"."exam_recurring_dispatch_runs"("exam_id",  "started_at" DESC);

-- CreateIndex: nuevos índices en exam_assignments
CREATE INDEX "idx_exam_assignment_status_due"   ON "crm"."exam_assignments"("status", "due_at");
CREATE INDEX "idx_exam_assignment_trigger_sent" ON "crm"."exam_assignments"("trigger", "sent_at" DESC);

-- AddForeignKey: assignment → dispatch run (SET NULL para que dispatch runs sobrevivan al borrar la asignación)
ALTER TABLE "crm"."exam_assignments"
  ADD CONSTRAINT "exam_assignments_dispatch_run_id_fkey"
  FOREIGN KEY ("dispatch_run_id") REFERENCES "crm"."exam_recurring_dispatch_runs"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey: dispatch run → exam (SET NULL para que corridas globales sobrevivan al borrar un Exam puntual)
ALTER TABLE "crm"."exam_recurring_dispatch_runs"
  ADD CONSTRAINT "exam_recurring_dispatch_runs_exam_id_fkey"
  FOREIGN KEY ("exam_id") REFERENCES "crm"."exams"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
