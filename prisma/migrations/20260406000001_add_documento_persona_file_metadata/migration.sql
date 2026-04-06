-- Add nullable fileName and mimeType columns to ops.documentos_persona.
-- Existing rows remain valid (nullable). The corporate and ATS postulation
-- flows already collect these fields; this migration lets us persist them.

ALTER TABLE "ops"."documentos_persona"
  ADD COLUMN IF NOT EXISTS "file_name" TEXT,
  ADD COLUMN IF NOT EXISTS "mime_type" TEXT;
