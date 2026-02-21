-- Exámenes ya no deben estar por defecto en costos directos del cotizador
UPDATE cpq.catalog_items
SET is_default = false
WHERE type = 'exam' AND is_default = true;
