-- Extender access_control_preregistrations con multi-día y patente
ALTER TABLE access_control.access_control_preregistrations
  ADD COLUMN IF NOT EXISTS expected_end_date DATE,
  ADD COLUMN IF NOT EXISTS vehicle_plate TEXT;
