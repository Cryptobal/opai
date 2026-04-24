-- Portal Cliente · Fase 1 · Privacidad de datos del guardia
-- Añade portalVisible a ExamAssignment, PsychResult y OpsSupervisionGuardEvaluation.
-- Default true: Gard puede ocultar puntuales desde backoffice cuando corresponda.

ALTER TABLE "crm"."exam_assignments"
  ADD COLUMN IF NOT EXISTS "portal_visible" BOOLEAN NOT NULL DEFAULT TRUE;

CREATE INDEX IF NOT EXISTS "idx_exam_assignment_portal_visible"
  ON "crm"."exam_assignments" ("portal_visible");

ALTER TABLE "psych"."results"
  ADD COLUMN IF NOT EXISTS "portal_visible" BOOLEAN NOT NULL DEFAULT TRUE;

CREATE INDEX IF NOT EXISTS "idx_psych_result_portal_visible"
  ON "psych"."results" ("portal_visible");

ALTER TABLE "ops"."supervision_guard_evaluations"
  ADD COLUMN IF NOT EXISTS "portal_visible" BOOLEAN NOT NULL DEFAULT TRUE;

CREATE INDEX IF NOT EXISTS "idx_supervision_guard_eval_portal_visible"
  ON "ops"."supervision_guard_evaluations" ("portal_visible");
