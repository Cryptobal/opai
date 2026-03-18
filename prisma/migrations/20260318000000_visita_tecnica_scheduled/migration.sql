-- Extend ops.visitas_tecnicas with scheduling fields (created from quotations)
ALTER TABLE ops.visitas_tecnicas
  ADD COLUMN IF NOT EXISTS "quote_id" TEXT,
  ADD COLUMN IF NOT EXISTS "scheduled_at" TIMESTAMPTZ(6),
  ADD COLUMN IF NOT EXISTS "scheduled_contact" TEXT,
  ADD COLUMN IF NOT EXISTS "scheduled_phone" TEXT,
  ADD COLUMN IF NOT EXISTS "puestos_detail" JSONB;

-- Index for quote link
CREATE INDEX IF NOT EXISTS "idx_ops_visitas_tecnicas_quote"
  ON ops.visitas_tecnicas ("quote_id");
