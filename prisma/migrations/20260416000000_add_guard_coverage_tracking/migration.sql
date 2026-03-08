-- Add guard coverage tracking fields

-- OpsControlNocturnoGuardia: status, turno, reemplazaDe, notes
ALTER TABLE "ops"."control_nocturno_guardias" ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'pendiente';
ALTER TABLE "ops"."control_nocturno_guardias" ADD COLUMN IF NOT EXISTS "turno" TEXT NOT NULL DEFAULT 'nocturno';
ALTER TABLE "ops"."control_nocturno_guardias" ADD COLUMN IF NOT EXISTS "reemplaza_de" TEXT;
ALTER TABLE "ops"."control_nocturno_guardias" ADD COLUMN IF NOT EXISTS "notes" TEXT;

-- OpsControlNocturnoInstalacion: coberturaStatus
ALTER TABLE "ops"."control_nocturno_instalaciones" ADD COLUMN IF NOT EXISTS "cobertura_status" TEXT NOT NULL DEFAULT 'pendiente';

-- Backfill: mark existing guards with horaLlegada as "presente"
UPDATE "ops"."control_nocturno_guardias" SET "status" = 'presente' WHERE "hora_llegada" IS NOT NULL AND "status" = 'pendiente';
