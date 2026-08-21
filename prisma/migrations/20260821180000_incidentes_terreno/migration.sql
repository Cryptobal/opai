-- Incidentes en terreno: columnas aditivas (QR público + evidencia + hub terreno).
-- Solo ADD COLUMN / índices. Cero DROP/RENAME.

ALTER TABLE "crm"."installations"
  ADD COLUMN IF NOT EXISTS "public_report_enabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "public_report_token" TEXT,
  ADD COLUMN IF NOT EXISTS "public_report_token_rotated_at" TIMESTAMPTZ(6);

CREATE UNIQUE INDEX IF NOT EXISTS "installations_public_report_token_key"
  ON "crm"."installations"("public_report_token");

ALTER TABLE "ops"."ops_tickets"
  ADD COLUMN IF NOT EXISTS "public_follow_token" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "ops_tickets_public_follow_token_key"
  ON "ops"."ops_tickets"("public_follow_token");

CREATE INDEX IF NOT EXISTS "idx_ops_tickets_installation_status"
  ON "ops"."ops_tickets"("installation_id", "status");

ALTER TABLE "ops"."ops_ticket_attachments"
  ADD COLUMN IF NOT EXISTS "kind" TEXT NOT NULL DEFAULT 'general';

ALTER TABLE "ops"."device_pairings"
  ADD COLUMN IF NOT EXISTS "portal_incidentes_enabled" BOOLEAN NOT NULL DEFAULT true;
