-- CRM: Copia oculta (BCC) en seguimientos automáticos
ALTER TABLE crm.crm_followup_config
  ADD COLUMN IF NOT EXISTS bcc_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS bcc_email TEXT;
