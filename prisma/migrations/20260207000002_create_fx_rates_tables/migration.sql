-- CreateTable: fx.uf_rates
CREATE TABLE fx.uf_rates (
  date DATE PRIMARY KEY,
  value NUMERIC(10, 2) NOT NULL,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  source TEXT DEFAULT 'SBIF',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_uf_rates_date_desc ON fx.uf_rates(date DESC);
CREATE INDEX idx_uf_rates_fetched ON fx.uf_rates(fetched_at DESC);

COMMENT ON TABLE fx.uf_rates IS 'Valores diarios de la UF (Unidad de Fomento)';
COMMENT ON COLUMN fx.uf_rates.value IS 'Valor UF en pesos chilenos';
COMMENT ON COLUMN fx.uf_rates.source IS 'Fuente: SBIF, Banco Central';

-- CreateTable: fx.utm_rates
CREATE TABLE fx.utm_rates (
  month DATE PRIMARY KEY, -- Primer día del mes
  value NUMERIC(10, 2) NOT NULL,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  source TEXT DEFAULT 'SII',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_utm_rates_month_desc ON fx.utm_rates(month DESC);
CREATE INDEX idx_utm_rates_fetched ON fx.utm_rates(fetched_at DESC);

COMMENT ON TABLE fx.utm_rates IS 'Valores mensuales de la UTM (Unidad Tributaria Mensual)';
COMMENT ON COLUMN fx.utm_rates.value IS 'Valor UTM en pesos chilenos';
COMMENT ON COLUMN fx.utm_rates.month IS 'Primer día del mes (ej: 2026-02-01)';
