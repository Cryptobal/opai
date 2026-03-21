-- CRM: Copia (CC) en seguimientos automáticos - solo cliente y email del tenant
ALTER TABLE crm.crm_followup_config
  ADD COLUMN IF NOT EXISTS cc_email TEXT;
