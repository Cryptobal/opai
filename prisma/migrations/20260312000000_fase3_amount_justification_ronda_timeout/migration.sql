-- 3.2: Justificación de monto en turno extra
ALTER TABLE "ops"."turnos_extra"
  ADD COLUMN "amount_justification" TEXT;

-- 3.4a: Config timeout rondas a nivel tenant (fallback global)
ALTER TABLE "public"."Tenant"
  ADD COLUMN "default_max_ronda_duration_minutes" INTEGER NOT NULL DEFAULT 120;

-- 3.4b: Config timeout rondas a nivel instalación (override)
ALTER TABLE "crm"."installations"
  ADD COLUMN "max_ronda_duration_minutes" INTEGER;

-- 3.4c: Motivo de penalización en ejecución de ronda
ALTER TABLE "ops"."ronda_ejecuciones"
  ADD COLUMN "penalizacion_motivo" TEXT;
