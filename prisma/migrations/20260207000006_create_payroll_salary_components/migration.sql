-- CreateTable: payroll.salary_components_catalog (opcional, para futuro)
CREATE TABLE payroll.salary_components_catalog (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  
  component_type TEXT NOT NULL CHECK (component_type IN ('HABER', 'DESCUENTO')),
  
  -- Atributos
  is_taxable BOOLEAN NOT NULL DEFAULT true,
  is_tributable BOOLEAN NOT NULL DEFAULT true,
  
  -- Estado
  is_active BOOLEAN NOT NULL DEFAULT true,
  display_order INT,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_components_type ON payroll.salary_components_catalog(component_type);
CREATE INDEX idx_components_active ON payroll.salary_components_catalog(is_active) WHERE is_active = true;
CREATE INDEX idx_components_code ON payroll.salary_components_catalog(code);

COMMENT ON TABLE payroll.salary_components_catalog IS 'Catálogo de conceptos de haberes y descuentos personalizables (para futuro)';
COMMENT ON COLUMN payroll.salary_components_catalog.is_taxable IS 'Afecto a cotizaciones previsionales';
COMMENT ON COLUMN payroll.salary_components_catalog.is_tributable IS 'Afecto a impuesto único';
