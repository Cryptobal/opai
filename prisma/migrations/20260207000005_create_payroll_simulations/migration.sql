-- CreateTable: payroll.simulations
CREATE TABLE payroll.simulations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- Tipo de simulación
  simulation_type TEXT NOT NULL CHECK (simulation_type IN ('employer_cost', 'payslip')),
  
  -- Referencias
  params_version_id UUID NOT NULL REFERENCES payroll.parameter_versions(id),
  assumptions_id UUID REFERENCES payroll.assumptions(id),
  
  -- Inputs (snapshot inmutable)
  inputs JSONB NOT NULL,
  
  -- Resultados (snapshot inmutable)
  results JSONB NOT NULL,
  
  -- Snapshot completo de parámetros + referencias UF/UTM usadas
  parameters_snapshot JSONB NOT NULL,
  
  -- Auditoría
  created_by_user_id TEXT,
  tenant_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Metadata
  client_info JSONB
);

CREATE INDEX idx_simulations_type ON payroll.simulations(simulation_type);
CREATE INDEX idx_simulations_created_at ON payroll.simulations(created_at DESC);
CREATE INDEX idx_simulations_user ON payroll.simulations(created_by_user_id) WHERE created_by_user_id IS NOT NULL;
CREATE INDEX idx_simulations_tenant ON payroll.simulations(tenant_id) WHERE tenant_id IS NOT NULL;
CREATE INDEX idx_simulations_params_version ON payroll.simulations(params_version_id);

COMMENT ON TABLE payroll.simulations IS 'Snapshots INMUTABLES de simulaciones de costo empleador y liquidaciones';
COMMENT ON COLUMN payroll.simulations.inputs IS 'Input completo de la simulación (nunca se recalcula)';
COMMENT ON COLUMN payroll.simulations.results IS 'Output completo calculado';
COMMENT ON COLUMN payroll.simulations.parameters_snapshot IS 'Copia completa del parameter_version + valores UF/UTM usados + topes calculados';
