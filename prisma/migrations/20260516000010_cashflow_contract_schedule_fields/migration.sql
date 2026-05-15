-- BLOQUE 5 FASE 1 — Campos de calendario de cobro por contrato.
-- Defaults seguros: items existentes mantienen comportamiento legacy.

ALTER TABLE finance.finance_cashflow_items
  ADD COLUMN nickname                       text,
  ADD COLUMN emite_proforma                 boolean   NOT NULL DEFAULT false,
  ADD COLUMN dia_emision_proforma           integer,
  ADD COLUMN dias_factura_desde_proforma    integer,
  ADD COLUMN dia_emision_factura            integer,
  ADD COLUMN mes_factura_relativo           text      NOT NULL DEFAULT 'MISMO_MES',
  ADD COLUMN modo_cobro                     text      NOT NULL DEFAULT 'DIRECTO',
  ADD COLUMN dias_cobro_desde_factura       integer   NOT NULL DEFAULT 0,
  ADD COLUMN costo_factoring_pct            numeric(5, 2);

-- Constraints de valores válidos para los enums-en-string.
ALTER TABLE finance.finance_cashflow_items
  ADD CONSTRAINT chk_cashflow_mes_factura_relativo
    CHECK (mes_factura_relativo IN ('MISMO_MES', 'MES_SIGUIENTE')),
  ADD CONSTRAINT chk_cashflow_modo_cobro
    CHECK (modo_cobro IN ('DIRECTO', 'FACTORING')),
  ADD CONSTRAINT chk_cashflow_costo_factoring_pct
    CHECK (
      costo_factoring_pct IS NULL
      OR (costo_factoring_pct >= 0 AND costo_factoring_pct <= 20)
    ),
  ADD CONSTRAINT chk_cashflow_dias_cobro_desde_factura
    CHECK (dias_cobro_desde_factura >= 0 AND dias_cobro_desde_factura <= 180),
  ADD CONSTRAINT chk_cashflow_dia_emision_proforma
    CHECK (
      dia_emision_proforma IS NULL
      OR (dia_emision_proforma BETWEEN 1 AND 31)
      OR dia_emision_proforma = -1
    ),
  ADD CONSTRAINT chk_cashflow_dia_emision_factura
    CHECK (
      dia_emision_factura IS NULL
      OR (dia_emision_factura BETWEEN 1 AND 31)
      OR dia_emision_factura = -1
    ),
  ADD CONSTRAINT chk_cashflow_dias_factura_desde_proforma
    CHECK (
      dias_factura_desde_proforma IS NULL
      OR (dias_factura_desde_proforma BETWEEN 0 AND 60)
    );

-- Coherencia: si emite_proforma=true, dia_emision_proforma y
-- dias_factura_desde_proforma deben estar poblados.
ALTER TABLE finance.finance_cashflow_items
  ADD CONSTRAINT chk_cashflow_proforma_fields_coherent
    CHECK (
      emite_proforma = false
      OR (dia_emision_proforma IS NOT NULL AND dias_factura_desde_proforma IS NOT NULL)
    );

-- Coherencia: si modo_cobro=FACTORING, costo_factoring_pct debe estar poblado.
ALTER TABLE finance.finance_cashflow_items
  ADD CONSTRAINT chk_cashflow_factoring_costo
    CHECK (
      modo_cobro = 'DIRECTO'
      OR (modo_cobro = 'FACTORING' AND costo_factoring_pct IS NOT NULL)
    );

-- Comentarios para documentación en DB:
COMMENT ON COLUMN finance.finance_cashflow_items.nickname IS
  'Nombre custom visible en el flujo. Si null, se usa name del item.';
COMMENT ON COLUMN finance.finance_cashflow_items.emite_proforma IS
  'Si emite proforma/estado de pago antes de la factura.';
COMMENT ON COLUMN finance.finance_cashflow_items.dias_cobro_desde_factura IS
  'Días entre emisión factura y entrada al banco. 0=legacy.';
COMMENT ON COLUMN finance.finance_cashflow_items.modo_cobro IS
  'DIRECTO = cliente paga; FACTORING = vendido al factor.';
COMMENT ON COLUMN finance.finance_cashflow_items.costo_factoring_pct IS
  'Costo del factoring % (solo si modo_cobro=FACTORING).';
