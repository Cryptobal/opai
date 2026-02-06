-- CreateTable: payroll.parameter_versions
CREATE TABLE payroll.parameter_versions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  description TEXT,
  effective_from DATE NOT NULL,
  effective_until DATE,
  data JSONB NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT false,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_param_versions_effective ON payroll.parameter_versions(effective_from DESC);
CREATE INDEX idx_param_versions_active ON payroll.parameter_versions(is_active) WHERE is_active = true;
CREATE INDEX idx_param_versions_dates ON payroll.parameter_versions(effective_from, effective_until);

-- Índice único parcial para asegurar solo una versión activa
CREATE UNIQUE INDEX idx_param_versions_single_active ON payroll.parameter_versions(is_active) WHERE is_active = true;

COMMENT ON TABLE payroll.parameter_versions IS 'Versiones inmutables de parámetros legales chilenos (AFP, Salud, SIS, AFC, impuestos, topes)';
COMMENT ON COLUMN payroll.parameter_versions.data IS 'JSON con todas las tasas, topes (UF), tramos impuesto. NO incluye valores UF/UTM (están en fx.*)';
COMMENT ON COLUMN payroll.parameter_versions.is_active IS 'Solo una versión puede estar activa a la vez';
COMMENT ON COLUMN payroll.parameter_versions.effective_from IS 'Fecha desde la cual esta versión es válida';
COMMENT ON COLUMN payroll.parameter_versions.effective_until IS 'Fecha hasta la cual esta versión es válida (null = indefinido)';
