-- Add rotative shift fields to serie_asignaciones table
ALTER TABLE "ops"."serie_asignaciones"
  ADD COLUMN "is_rotativo" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "rotate_puesto_id" UUID,
  ADD COLUMN "rotate_slot_number" INTEGER,
  ADD COLUMN "start_shift" TEXT,
  ADD COLUMN "linked_serie_id" UUID;

-- Index for linked serie lookups
CREATE INDEX "idx_ops_serie_asig_linked" ON "ops"."serie_asignaciones" ("linked_serie_id");
