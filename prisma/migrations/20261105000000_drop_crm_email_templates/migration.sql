-- D2 (PR-10): CrmEmailTemplate sin consumidores reales — la UI era un
-- redirect muerto y el único caller de API (lead reject con emailTemplateId)
-- no recibía ese parámetro desde ninguna pantalla. Las plantillas de correo
-- reales viven en DocTemplate (module="mail", Gestión Documental → Templates).
-- Se elimina modelo, rutas /api/crm/email-templates y UI.

DROP TABLE IF EXISTS "crm"."email_templates";
