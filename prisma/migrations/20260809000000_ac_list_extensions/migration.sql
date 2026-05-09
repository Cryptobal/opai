-- Extender access_control_lists con tipo de persona, uso único y usedAt
ALTER TABLE access_control.access_control_lists
  ADD COLUMN IF NOT EXISTS record_type TEXT DEFAULT 'visit',
  ADD COLUMN IF NOT EXISTS single_use BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS used_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_ac_lists_record_type
  ON access_control.access_control_lists(record_type)
  WHERE record_type IS NOT NULL;
