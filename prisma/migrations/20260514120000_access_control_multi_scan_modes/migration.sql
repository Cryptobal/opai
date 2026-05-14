-- AccessControlRecordType: agregar scan_modes (array) + backfill desde scan_mode
ALTER TABLE access_control.access_control_record_types
  ADD COLUMN IF NOT EXISTS scan_modes TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

UPDATE access_control.access_control_record_types
SET scan_modes = ARRAY[scan_mode]
WHERE array_length(scan_modes, 1) IS NULL AND scan_mode IS NOT NULL;

-- AccessControlConfig: agregar recordTypeScanModes JSONB para overrides de defaults
ALTER TABLE access_control.access_control_configs
  ADD COLUMN IF NOT EXISTS record_type_scan_modes JSONB NOT NULL DEFAULT '{}'::JSONB;
