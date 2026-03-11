-- Face ID fields on guardias
ALTER TABLE "ops"."guardias" ADD COLUMN IF NOT EXISTS "face_id_registered" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "ops"."guardias" ADD COLUMN IF NOT EXISTS "face_id_aws_id" TEXT;
ALTER TABLE "ops"."guardias" ADD COLUMN IF NOT EXISTS "face_id_photo_url" TEXT;
ALTER TABLE "ops"."guardias" ADD COLUMN IF NOT EXISTS "face_id_photo_key" TEXT;
ALTER TABLE "ops"."guardias" ADD COLUMN IF NOT EXISTS "face_id_registered_at" TIMESTAMPTZ(6);
ALTER TABLE "ops"."guardias" ADD COLUMN IF NOT EXISTS "face_id_consent_at" TIMESTAMPTZ(6);
ALTER TABLE "ops"."guardias" ADD COLUMN IF NOT EXISTS "face_id_consent_revoked" BOOLEAN NOT NULL DEFAULT false;

-- Marcacion portal flag on device_pairings
ALTER TABLE "ops"."device_pairings" ADD COLUMN IF NOT EXISTS "portal_marcacion_enabled" BOOLEAN NOT NULL DEFAULT true;

-- New fields on marcaciones
ALTER TABLE "ops"."marcaciones" ADD COLUMN IF NOT EXISTS "face_confidence" DOUBLE PRECISION;
ALTER TABLE "ops"."marcaciones" ADD COLUMN IF NOT EXISTS "offline_sync" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "ops"."marcaciones" ADD COLUMN IF NOT EXISTS "device_timestamp" TIMESTAMPTZ(6);

-- New fields on asistencia_diaria
ALTER TABLE "ops"."asistencia_diaria" ADD COLUMN IF NOT EXISTS "marcacion_entrada_id" UUID;
ALTER TABLE "ops"."asistencia_diaria" ADD COLUMN IF NOT EXISTS "marcacion_salida_id" UUID;
ALTER TABLE "ops"."asistencia_diaria" ADD COLUMN IF NOT EXISTS "source" TEXT NOT NULL DEFAULT 'manual';

-- Foreign keys for asistencia_diaria -> marcaciones
ALTER TABLE "ops"."asistencia_diaria"
  ADD CONSTRAINT "asistencia_diaria_marcacion_entrada_id_fkey"
  FOREIGN KEY ("marcacion_entrada_id") REFERENCES "ops"."marcaciones"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ops"."asistencia_diaria"
  ADD CONSTRAINT "asistencia_diaria_marcacion_salida_id_fkey"
  FOREIGN KEY ("marcacion_salida_id") REFERENCES "ops"."marcaciones"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
