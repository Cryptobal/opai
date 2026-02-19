-- CPQ: Tasa financiera por defecto 2,5%
ALTER TABLE cpq.quote_parameters
  ALTER COLUMN financial_rate_pct SET DEFAULT 2.5;
