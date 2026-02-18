-- Add TE (Turno Extra) guard fields to ops.guardias
-- Used for quick-entry TE guards: OS-10, uniform, antecedentes, evaluation

ALTER TABLE "ops"."guardias"
  ADD COLUMN IF NOT EXISTS "os10" BOOLEAN,
  ADD COLUMN IF NOT EXISTS "estado_uniforme" TEXT,
  ADD COLUMN IF NOT EXISTS "prendas_faltantes" TEXT,
  ADD COLUMN IF NOT EXISTS "validado_antecedentes" BOOLEAN,
  ADD COLUMN IF NOT EXISTS "nota_evaluacion" TEXT,
  ADD COLUMN IF NOT EXISTS "comentario_evaluacion" TEXT,
  ADD COLUMN IF NOT EXISTS "te_registrado_por" TEXT;

COMMENT ON COLUMN "ops"."guardias"."os10" IS 'Credencial OS-10: Sí/No';
COMMENT ON COLUMN "ops"."guardias"."estado_uniforme" IS 'completo | incompleto';
COMMENT ON COLUMN "ops"."guardias"."prendas_faltantes" IS 'Solo si estado_uniforme = incompleto';
COMMENT ON COLUMN "ops"."guardias"."validado_antecedentes" IS 'Solo Admin/RRHH pueden editar';
COMMENT ON COLUMN "ops"."guardias"."nota_evaluacion" IS 'bueno | regular | malo';
COMMENT ON COLUMN "ops"."guardias"."te_registrado_por" IS 'Admin ID del supervisor que ingresó el guardia TE';
