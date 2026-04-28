-- Tracking de origen de la postulación (web, whatsapp, referido, ads...)
-- Permite distinguir si el postulante llegó desde la web pública o desde un link enviado por WhatsApp por un reclutador.

ALTER TABLE "ops"."guardias"
  ADD COLUMN IF NOT EXISTS "source" TEXT,
  ADD COLUMN IF NOT EXISTS "source_details" JSONB,
  ADD COLUMN IF NOT EXISTS "tiene_os10_declarado" TEXT,
  ADD COLUMN IF NOT EXISTS "referred_by_admin_id" TEXT;

CREATE INDEX IF NOT EXISTS "idx_ops_guardias_source"
  ON "ops"."guardias" ("source");

CREATE INDEX IF NOT EXISTS "idx_ops_guardias_referred_by_admin"
  ON "ops"."guardias" ("referred_by_admin_id");

ALTER TABLE "ops"."guardias"
  ADD CONSTRAINT "ops_guardias_referred_by_admin_fk"
  FOREIGN KEY ("referred_by_admin_id")
  REFERENCES "public"."admins" ("id")
  ON DELETE SET NULL
  ON UPDATE CASCADE;
