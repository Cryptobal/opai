-- Limpieza: cuando un item tiene emite_proforma=true, los campos
-- dia_emision_factura y mes_factura_relativo son DERIVADOS (no inputs
-- del usuario). Los reseteamos para evitar la doble suma de mes que
-- ocurría con valores como (proforma día 20, +15 días, dia_factura=31,
-- mes_factura=MES_SIGUIENTE) → backend rola al mes siguiente Y suma
-- otro mes extra.

UPDATE finance.finance_cashflow_items
SET dia_emision_factura = NULL,
    mes_factura_relativo = 'MISMO_MES'
WHERE emite_proforma = true
  AND (dia_emision_factura IS NOT NULL OR mes_factura_relativo <> 'MISMO_MES');
