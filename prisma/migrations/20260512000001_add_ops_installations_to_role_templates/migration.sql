-- Agregar ops.installations a todos los RoleTemplates que tienen crm.installations.
-- Permite que usuarios con acceso a Operaciones vean Instalaciones sin necesitar módulo CRM.
UPDATE "public"."role_templates"
SET "permissions" = jsonb_set(
  "permissions",
  '{submodules}',
  COALESCE("permissions"->'submodules', '{}'::jsonb) || '{"ops.installations":"view"}'::jsonb
)
WHERE "permissions"->'submodules' ? 'crm.installations'
  AND (NOT ("permissions"->'submodules' ? 'ops.installations'));
