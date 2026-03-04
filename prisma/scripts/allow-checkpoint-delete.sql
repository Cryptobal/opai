-- Permite eliminar checkpoints manteniendo las marcaciones de rondas.
-- Las filas en marcacion_checkpoints quedarán con checkpoint_id = NULL.
-- Ejecutar una sola vez contra tu base de datos (ej: psql $DATABASE_URL -f prisma/scripts/allow-checkpoint-delete.sql).

BEGIN;

-- 1. Permitir NULL en checkpoint_id
ALTER TABLE ops.marcacion_checkpoints
  ALTER COLUMN checkpoint_id DROP NOT NULL;

-- 2. Quitar la FK actual (Restrict)
ALTER TABLE ops.marcacion_checkpoints
  DROP CONSTRAINT IF EXISTS marcacion_checkpoints_checkpoint_id_fkey;

-- 3. Volver a crear la FK con ON DELETE SET NULL
ALTER TABLE ops.marcacion_checkpoints
  ADD CONSTRAINT marcacion_checkpoints_checkpoint_id_fkey
  FOREIGN KEY (checkpoint_id) REFERENCES ops.checkpoints(id) ON DELETE SET NULL;

COMMIT;
