-- ──────────────────────────────────────────────────────────────────────
-- Drive → OPAI — import bilateral de documentos (ADITIVA).
--
--   crm.files.drive_file_id
-- ──────────────────────────────────────────────────────────────────────

ALTER TABLE "crm"."files"
  ADD COLUMN IF NOT EXISTS "drive_file_id" TEXT;

CREATE INDEX IF NOT EXISTS "idx_crm_files_drive_file"
  ON "crm"."files" ("drive_file_id");
