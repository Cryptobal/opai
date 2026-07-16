-- Timing de emisión de la factura real por programación recurrente.
-- Aditivo y con defaults: las plantillas existentes quedan en AL_EMITIR, que es
-- exactamente el comportamiento histórico (la cuota se proyecta el día de la
-- programación). Sin backfill, sin lock de tabla riesgoso.
ALTER TABLE finance.finance_dte_recurring_templates
  ADD COLUMN IF NOT EXISTS factura_timing text NOT NULL DEFAULT 'AL_EMITIR',
  ADD COLUMN IF NOT EXISTS factura_day integer,
  ADD COLUMN IF NOT EXISTS factura_mes_relativo text NOT NULL DEFAULT 'MES_SIGUIENTE';
