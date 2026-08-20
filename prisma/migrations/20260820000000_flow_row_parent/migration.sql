-- Subfilas GAV/OTROS: un nivel bajo la categoría (cuenta contable).
ALTER TABLE "finance"."finance_flow_rows"
  ADD COLUMN IF NOT EXISTS "parent_id" UUID;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'finance_flow_rows_parent_id_fkey'
  ) THEN
    ALTER TABLE "finance"."finance_flow_rows"
      ADD CONSTRAINT "finance_flow_rows_parent_id_fkey"
      FOREIGN KEY ("parent_id") REFERENCES "finance"."finance_flow_rows"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "idx_finance_flow_row_tenant_parent"
  ON "finance"."finance_flow_rows"("tenant_id", "parent_id");
