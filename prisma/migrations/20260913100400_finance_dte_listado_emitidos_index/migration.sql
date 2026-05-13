-- Índice compuesto para soportar el orderBy del listado de DTEs Emitidos
-- (page server src/app/(app)/finanzas/facturacion/dtes/page.tsx):
--
--   orderBy: [{ siiStatus: 'asc' }, { date: 'desc' }, { folio: 'desc' }]
--
-- En Fase 2.G el listado pasa a cursor pagination con cursor compuesto
-- de 4 keys (siiStatus, date, folio, id). Sin este índice el cursor
-- degenera en seq-scan sobre finance.finance_dtes (millones de rows
-- en clientes grandes).
--
-- IF NOT EXISTS por safety: si la migración se aplica dos veces en
-- entornos manuales (poco probable pero defensivo), no falla.

CREATE INDEX IF NOT EXISTS "idx_finance_dte_listado_emitidos"
  ON "finance"."finance_dtes" (
    "tenant_id",
    "direction",
    "sii_status",
    "date" DESC,
    "folio" DESC
  );
