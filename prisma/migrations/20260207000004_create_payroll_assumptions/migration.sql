-- CreateTable: payroll.assumptions
CREATE TABLE payroll.assumptions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  description TEXT,
  
  -- Provisiones laborales
  vacation_provision_pct NUMERIC(5, 4) NOT NULL DEFAULT 0.0833,
  severance_provision_pct NUMERIC(5, 4) NOT NULL DEFAULT 0.0000,
  holiday_bonus_pct NUMERIC(5, 4) NOT NULL DEFAULT 0.0000,
  christmas_bonus_pct NUMERIC(5, 4) NOT NULL DEFAULT 0.0000,
  
  -- Mutual (puede ser override de risk_levels)
  work_injury_basic_rate NUMERIC(6, 5),
  work_injury_additional_rate NUMERIC(6, 5),
  work_injury_extra_rate NUMERIC(6, 5),
  work_injury_total_rate NUMERIC(6, 5),
  work_injury_risk_level TEXT DEFAULT 'medium' CHECK (work_injury_risk_level IN ('low', 'medium', 'high', 'custom')),
  
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_assumptions_default ON payroll.assumptions(is_default) WHERE is_default = true;

COMMENT ON TABLE payroll.assumptions IS 'Configuraciones de provisiones y costeo (no son parámetros legales)';
COMMENT ON COLUMN payroll.assumptions.vacation_provision_pct IS 'Provisión vacaciones (8.33% = 15 días/año)';
COMMENT ON COLUMN payroll.assumptions.work_injury_risk_level IS 'Nivel de riesgo: low, medium, high, custom (si custom, usar *_rate)';
COMMENT ON COLUMN payroll.assumptions.work_injury_total_rate IS 'Tasa total mutual si es custom';
