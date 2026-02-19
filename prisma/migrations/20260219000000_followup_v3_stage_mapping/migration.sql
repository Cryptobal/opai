-- CRM follow-up v3: tercer seguimiento + mapping de etapas por ID
ALTER TABLE crm.crm_followup_config
  ADD COLUMN IF NOT EXISTS third_followup_days INT NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS third_email_template_id UUID,
  ADD COLUMN IF NOT EXISTS whatsapp_third_enabled BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS first_followup_stage_id UUID,
  ADD COLUMN IF NOT EXISTS second_followup_stage_id UUID;

CREATE INDEX IF NOT EXISTS idx_crm_followup_config_first_stage
  ON crm.crm_followup_config (first_followup_stage_id);

CREATE INDEX IF NOT EXISTS idx_crm_followup_config_second_stage
  ON crm.crm_followup_config (second_followup_stage_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'fk_crm_followup_config_first_stage'
  ) THEN
    ALTER TABLE crm.crm_followup_config
      ADD CONSTRAINT fk_crm_followup_config_first_stage
      FOREIGN KEY (first_followup_stage_id)
      REFERENCES crm.pipeline_stages(id)
      ON DELETE SET NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'fk_crm_followup_config_second_stage'
  ) THEN
    ALTER TABLE crm.crm_followup_config
      ADD CONSTRAINT fk_crm_followup_config_second_stage
      FOREIGN KEY (second_followup_stage_id)
      REFERENCES crm.pipeline_stages(id)
      ON DELETE SET NULL;
  END IF;
END $$;
