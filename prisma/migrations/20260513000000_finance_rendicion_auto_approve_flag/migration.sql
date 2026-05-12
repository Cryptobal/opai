-- Add opt-in auto-approve flag for tenants that do not want to enforce approver configuration.
-- Default false: submit will be blocked when no approvers are configured.
ALTER TABLE finance.finance_rendicion_config
  ADD COLUMN IF NOT EXISTS auto_approve_when_no_approvers BOOLEAN NOT NULL DEFAULT FALSE;
