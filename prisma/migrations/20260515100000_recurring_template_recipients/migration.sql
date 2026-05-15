-- Agrega columna recipient_contact_ids a finance_dte_recurring_templates.
-- Default [] para compat retroactiva: las plantillas existentes mantienen
-- el comportamiento actual (no envío) hasta que el usuario las edite y
-- agregue contactos. El cron loggea warning explícito cuando autoSendProforma
-- o autoSendPaymentStatement están activos pero la lista está vacía.

ALTER TABLE finance.finance_dte_recurring_templates
ADD COLUMN recipient_contact_ids uuid[] NOT NULL DEFAULT ARRAY[]::uuid[];
