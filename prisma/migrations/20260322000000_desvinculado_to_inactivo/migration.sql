-- Migrate lifecycle_status 'desvinculado' to 'inactivo'
-- Part of personas state simplification: remove desvinculado, use inactivo only

UPDATE ops.guardias
SET lifecycle_status = 'inactivo'
WHERE lifecycle_status = 'desvinculado';
