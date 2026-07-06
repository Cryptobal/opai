-- CRM: interruptor para la copia (CC) al tenant en seguimientos automáticos.
-- Default true = conserva el comportamiento actual (siempre se copiaba al tenant).
-- Si false, el follow-up se envía SOLO al cliente, sin copia CC al tenant.
ALTER TABLE crm.crm_followup_config
  ADD COLUMN IF NOT EXISTS cc_enabled BOOLEAN NOT NULL DEFAULT true;
