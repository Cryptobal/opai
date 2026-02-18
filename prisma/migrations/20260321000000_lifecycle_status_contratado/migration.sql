-- Migrate lifecycle_status: contratado_activo, supervisor, administrativo -> contratado
-- Only lifecycle_status is updated; status column is NOT touched (payroll uses it)

UPDATE ops.guardias SET lifecycle_status = 'contratado' WHERE lifecycle_status = 'contratado_activo';
UPDATE ops.guardias SET lifecycle_status = 'contratado' WHERE lifecycle_status IN ('supervisor', 'administrativo');
