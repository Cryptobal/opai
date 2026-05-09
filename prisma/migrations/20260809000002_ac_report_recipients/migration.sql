-- Tabla de destinatarios de reportes automáticos por instalación
CREATE TABLE IF NOT EXISTS access_control.access_control_report_recipients (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id TEXT NOT NULL,
  installation_id UUID NOT NULL REFERENCES crm.installations(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES crm.contacts(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  name TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ac_report_recipients_installation
  ON access_control.access_control_report_recipients(installation_id);
CREATE INDEX IF NOT EXISTS idx_ac_report_recipients_tenant
  ON access_control.access_control_report_recipients(tenant_id);

-- Campo lastSentAt en config para evitar doble envío
ALTER TABLE access_control.access_control_configs
  ADD COLUMN IF NOT EXISTS auto_report_last_sent_at TIMESTAMPTZ;
