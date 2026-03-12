-- Seed role template "jefe_operaciones" for all tenants that don't have it yet.
-- Permisos: ver todas las visitas de supervisión, CRM solo lectura (sin CPQ), rendiciones propias, sin payroll.
INSERT INTO "public"."role_templates" ("id", "tenant_id", "name", "slug", "description", "is_system", "permissions", "created_at", "updated_at")
SELECT
    gen_random_uuid()::text,
    t.id,
    'Jefe de operaciones',
    'jefe_operaciones',
    'Ve todas las visitas de supervisión, CRM solo lectura (sin CPQ), rendiciones propias. Sin payroll.',
    false,
    '{"modules":{"hub":"view","ops":"edit","crm":"view","docs":"none","payroll":"none","cpq":"none","config":"none","finance":"edit"},"submodules":{"crm.leads":"view","crm.accounts":"view","crm.installations":"view","crm.dotacion":"view","crm.contacts":"view","crm.deals":"view","crm.quotes":"none","finance.rendiciones":"edit","finance.aprobaciones":"view","finance.pagos":"none","finance.configuracion":"none","finance.contabilidad":"none","finance.facturacion":"none","finance.proveedores":"none","finance.reportes":"none"},"capabilities":{"supervision_view_all":true,"supervision_view_own":true,"supervision_dashboard":true,"supervision_checkin":true,"rendicion_submit":true,"te_approve":true,"rondas_configure":true,"rondas_resolve_alerts":true,"monitoreo_cerrar_turno":true,"control_nocturno_approve":true,"ticket_approve":true}}'::jsonb,
    NOW(),
    NOW()
FROM "public"."Tenant" t
WHERE NOT EXISTS (
    SELECT 1 FROM "public"."role_templates" rt
    WHERE rt."tenant_id" = t.id AND rt."slug" = 'jefe_operaciones'
);
