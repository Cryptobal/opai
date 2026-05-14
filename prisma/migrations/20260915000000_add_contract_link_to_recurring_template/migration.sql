-- AddColumn: enlace opcional de plantilla recurrente DTE → contrato (Document).
-- Permite cascada de desactivación cuando se elimina el contrato y agrupar
-- programaciones bajo su contrato de origen en la UI del CRM.
ALTER TABLE "finance"."finance_dte_recurring_templates"
ADD COLUMN IF NOT EXISTS "contract_document_id" UUID;

-- Index para resolver "todas las plantillas de este contrato" en O(log n).
CREATE INDEX IF NOT EXISTS "idx_dte_recurring_contract_doc"
ON "finance"."finance_dte_recurring_templates" ("contract_document_id");
