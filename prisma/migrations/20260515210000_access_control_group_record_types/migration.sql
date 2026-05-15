-- Add record_types column to access_control_list_groups
ALTER TABLE access_control.access_control_list_groups
  ADD COLUMN IF NOT EXISTS record_types TEXT[] NOT NULL DEFAULT '{}';
