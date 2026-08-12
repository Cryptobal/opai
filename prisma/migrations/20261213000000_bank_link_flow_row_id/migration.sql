-- Aditiva: fila de flujo explícita en vínculos bancarios (clasificación manual / reglas FLOW_ROW).
-- Desambigua filas que comparten cuenta contable (ej. Aporte vs Devolución a socios → Acreedores Varios).

ALTER TABLE "finance"."finance_bank_transaction_links"
  ADD COLUMN "flow_row_id" UUID;

ALTER TABLE "finance"."finance_bank_transaction_links"
  ADD CONSTRAINT "finance_bank_transaction_links_flow_row_id_fkey"
  FOREIGN KEY ("flow_row_id") REFERENCES "finance"."finance_flow_rows"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "idx_finance_bank_link_flow_row"
  ON "finance"."finance_bank_transaction_links" ("tenant_id", "flow_row_id");
