-- Apaga la alerta Art. 45.1 en configs ya persistidas.
-- El default de código pasa a false; sin este UPDATE, tenants que guardaron
-- marcacion_config tras el merge de Res. 38 quedarían con el flag en true.

UPDATE "Setting"
SET value = jsonb_set(value::jsonb, '{alertaFaltaMarcacionEnabled}', 'false', true)::text,
    "updatedAt" = NOW()
WHERE key LIKE 'marcacion_config:%'
  AND value ~ '^\s*\{';
