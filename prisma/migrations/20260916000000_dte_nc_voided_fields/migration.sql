-- Agrega campos para reflejar el estado de acreditación de un DTE por NCs.
--
-- Decisiones de diseño:
--  * siiStatus se mantiene ACCEPTED en el original (la NC no anula
--    el documento ante el SII, lo acredita contablemente).
--  * voidedByCreditNoteId se setea cuando hay NC con CodRef=1 (anula).
--  * creditedNetAmount se incrementa cuando hay NC con CodRef=3 (parcial).
--  * Flujo de caja y cobranzas filtran fuera cualquier factura con
--    NC viva. Estado de resultados (sales-aggregator) NO usa estos
--    campos: sigue con bruto+ND-NC para fidelidad al libro IVA.

ALTER TABLE finance.finance_dtes
ADD COLUMN voided_by_credit_note_id uuid NULL,
ADD COLUMN voided_at timestamptz(6) NULL,
ADD COLUMN credited_net_amount numeric(15, 2) NOT NULL DEFAULT 0;

CREATE INDEX idx_finance_dte_voided
ON finance.finance_dtes (tenant_id, voided_by_credit_note_id);
