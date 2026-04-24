-- Asegura que las columnas y tipos de Fase 1.5 existen en psych.tenant_config
-- y psych.client_contract_config (idempotente, safe para correr múltiples veces).

DO $$ BEGIN
  CREATE TYPE psych."PsychClientReportLevel" AS ENUM ('SEAL','SUMMARY','FULL');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- tenant_config: columnas nuevas de Fase 1.5
ALTER TABLE psych.tenant_config
  ADD COLUMN IF NOT EXISTS reevaluation_interval_months INTEGER NOT NULL DEFAULT 6,
  ADD COLUMN IF NOT EXISTS whatsapp_template TEXT,
  ADD COLUMN IF NOT EXISTS email_subject TEXT,
  ADD COLUMN IF NOT EXISTS email_body TEXT,
  ADD COLUMN IF NOT EXISTS sms_template TEXT,
  ADD COLUMN IF NOT EXISTS default_client_report_level psych."PsychClientReportLevel" NOT NULL DEFAULT 'SEAL';

-- Asegurar que existe tabla client_contract_config
CREATE TABLE IF NOT EXISTS psych.client_contract_config (
  id                    TEXT PRIMARY KEY,
  tenant_id             TEXT NOT NULL,
  contract_id           TEXT NOT NULL UNIQUE,
  report_level          psych."PsychClientReportLevel" NOT NULL DEFAULT 'SEAL',
  show_evaluation_date  BOOLEAN NOT NULL DEFAULT true,
  show_coverage         BOOLEAN NOT NULL DEFAULT true,
  show_individual_seal  BOOLEAN NOT NULL DEFAULT true,
  dpa_signed_at         TIMESTAMP(3),
  dpa_doc_id            TEXT,
  dpa_note              TEXT,
  updated_at            TIMESTAMP(3) NOT NULL,
  created_at            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS client_contract_config_tenant_idx
  ON psych.client_contract_config(tenant_id);

-- Verificación
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'psych' AND table_name = 'tenant_config'
  AND column_name IN (
    'reevaluation_interval_months','whatsapp_template','email_subject',
    'email_body','sms_template','default_client_report_level'
  )
ORDER BY column_name;
