-- Añade columnas de reemplazo a ops.pauta_mensual (replacement_guardia_id, replacement_reason, guard_event_id)
-- Ejecutar una sola vez.

BEGIN;

-- 1. Columnas
ALTER TABLE ops.pauta_mensual
  ADD COLUMN IF NOT EXISTS replacement_guardia_id UUID NULL;

ALTER TABLE ops.pauta_mensual
  ADD COLUMN IF NOT EXISTS replacement_reason TEXT NULL;

ALTER TABLE ops.pauta_mensual
  ADD COLUMN IF NOT EXISTS guard_event_id UUID NULL;

-- 2. Índices
CREATE INDEX IF NOT EXISTS idx_ops_pauta_reemplazo_guardia ON ops.pauta_mensual(replacement_guardia_id);
CREATE INDEX IF NOT EXISTS idx_ops_pauta_guard_event ON ops.pauta_mensual(guard_event_id);

-- 3. Foreign keys (solo si no existen)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'pauta_mensual_replacement_guardia_id_fkey'
  ) THEN
    ALTER TABLE ops.pauta_mensual
      ADD CONSTRAINT pauta_mensual_replacement_guardia_id_fkey
      FOREIGN KEY (replacement_guardia_id) REFERENCES ops.guardias(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'pauta_mensual_guard_event_id_fkey'
  ) THEN
    ALTER TABLE ops.pauta_mensual
      ADD CONSTRAINT pauta_mensual_guard_event_id_fkey
      FOREIGN KEY (guard_event_id) REFERENCES ops.guard_events(id) ON DELETE SET NULL;
  END IF;
END $$;

COMMIT;
