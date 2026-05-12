-- Cambia finance.finance_bank_transactions.hidden_by de uuid → text
-- porque Admin.id es cuid() (no UUID). El cast fallaba con
-- "Inconsistent column data: Error creating UUID, invalid character: ... found 'm' at 2"
-- al pasar un cuid (ej. "cml...") a una columna tipada como uuid.

ALTER TABLE finance.finance_bank_transactions
  ALTER COLUMN hidden_by TYPE text USING hidden_by::text;
