-- BACKFILL: para cada NC viva (dteType=61) emitida ANTES del Bloque 1,
-- actualizar el DTE original según CodRef.
-- Además: limpiar Occurrences mal enganchadas a NCs/ND (bug del matcher
-- arreglado en Bloque 1.6).
--
-- ROLLBACK SEGURO (3 UPDATEs reversibles, ningún DELETE / DROP):
--   ver sección "Rollback" al final de BLOQUE_1_5_backfill_nc_ampliado.md.

-- ── 1) BACKFILL CodRef=1 (anulación total) ──
-- Para cada NC viva con CodRef=1, setear voidedByCreditNoteId y voidedAt
-- en el DTE referenciado. Si hubiera dos NCs CodRef=1 sobre el mismo
-- original (estado inconsistente que el Guard 1 ya previene a futuro),
-- gana la más reciente.
UPDATE finance.finance_dtes orig
SET
  voided_by_credit_note_id = nc.id,
  voided_at = nc.created_at
FROM (
  SELECT DISTINCT ON (reference_dte_id)
    id, reference_dte_id, created_at
  FROM finance.finance_dtes
  WHERE dte_type = 61
    AND reference_code = 1
    AND sii_status IN ('ACCEPTED', 'PENDING', 'SENT', 'WITH_OBJECTIONS')
  ORDER BY reference_dte_id, created_at DESC
) nc
WHERE orig.id = nc.reference_dte_id
  AND orig.voided_by_credit_note_id IS NULL;

-- ── 2) BACKFILL CodRef=3 (parcial) ──
-- Sumar los netos de TODAS las NCs vivas con CodRef=3 sobre el original.
UPDATE finance.finance_dtes orig
SET credited_net_amount = COALESCE(sub.total_credited, 0)
FROM (
  SELECT reference_dte_id, SUM(net_amount) AS total_credited
  FROM finance.finance_dtes
  WHERE dte_type = 61
    AND reference_code = 3
    AND sii_status IN ('ACCEPTED', 'PENDING', 'SENT', 'WITH_OBJECTIONS')
  GROUP BY reference_dte_id
) sub
WHERE orig.id = sub.reference_dte_id
  AND orig.credited_net_amount = 0;

-- ── 3) NUEVO: LIMPIAR Occurrences mal enganchadas a NCs/ND ──
-- Bug del matcher anterior al Bloque 1.6: el matcher enganchaba NCs y
-- ND como Occurrences del contrato. En el flujo aparecían como
-- "Factura N° X Pagada" dentro de la celda del contrato. Set dteId=NULL
-- para desenganchar — la celda vuelve a mostrar solo lo proyectado.
UPDATE finance.finance_cashflow_occurrences occ
SET dte_id = NULL
FROM finance.finance_dtes dte
WHERE occ.dte_id = dte.id
  AND dte.dte_type IN (56, 61);
