-- Portal del Cliente: campos en CrmContact
ALTER TABLE crm.contacts ADD COLUMN IF NOT EXISTS portal_pin TEXT;
ALTER TABLE crm.contacts ADD COLUMN IF NOT EXISTS portal_pin_visible TEXT;
ALTER TABLE crm.contacts ADD COLUMN IF NOT EXISTS portal_enabled BOOLEAN DEFAULT false;
ALTER TABLE crm.contacts ADD COLUMN IF NOT EXISTS portal_last_access_at TIMESTAMPTZ;
ALTER TABLE crm.contacts ADD COLUMN IF NOT EXISTS portal_last_access_ip TEXT;
