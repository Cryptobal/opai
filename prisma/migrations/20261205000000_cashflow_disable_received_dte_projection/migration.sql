-- Cartola-first: apagar proyección de facturas de compra en tenants existentes.
-- La migración 20261203000000 solo cambió el DEFAULT; las filas quedaron en true
-- y "Otros egresos" seguía llenándose con DTEs RECEIVED sin categoría/proveedor.

UPDATE "finance"."finance_cashflow_config"
SET "project_received_dtes_as_expense" = false
WHERE "project_received_dtes_as_expense" = true;
