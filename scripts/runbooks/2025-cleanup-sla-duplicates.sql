-- Runbook: Cleanup de notificaciones SLA duplicadas
-- Fecha: 2025-XX-XX
-- Causa: bug de filtrado en visibleNotificationsWhere + fan-out al grupo
--        completo en sla-monitor. Ver fix en commit fix(notifs):...
--
-- Objetivo: eliminar todos los bells acumulados de tickets SLA. El cron
-- recreará los necesarios en su próxima corrida (cada 15 min) ya con la
-- nueva lógica (sólo al assignedTo, agrupado por usuario).
--
-- Ejecutar EN VERCEL → Storage → Postgres → SQL Editor o vía psql contra
-- DATABASE_URL de producción. Reversible vía backup, irreversible en el
-- mismo runtime.
--
-- ⚠️ Verificar antes:
--   SELECT type, COUNT(*) FROM crm.notifications
--   WHERE type IN ('ticket_sla_breached','ticket_sla_breached_batch','ticket_sla_approaching')
--   GROUP BY type;
--
-- Y después confirmar:
--   SELECT COUNT(*) FROM crm.notifications
--   WHERE type IN ('ticket_sla_breached','ticket_sla_breached_batch','ticket_sla_approaching');
--   -- esperado: 0 (o muy pocas si el cron ya corrió)

BEGIN;

-- 1) Borrar readStates asociados (cascade desde notification ya lo hace,
--    pero hacemos explícito por seguridad)
DELETE FROM crm.notification_read_states
WHERE notification_id IN (
  SELECT id FROM crm.notifications
  WHERE type IN (
    'ticket_sla_breached',
    'ticket_sla_breached_batch',
    'ticket_sla_approaching'
  )
);

-- 2) Borrar las notificaciones SLA propiamente dichas
DELETE FROM crm.notifications
WHERE type IN (
  'ticket_sla_breached',
  'ticket_sla_breached_batch',
  'ticket_sla_approaching'
);

-- Verificación (no falla, sólo informa)
SELECT
  type,
  COUNT(*) AS remaining
FROM crm.notifications
WHERE type LIKE 'ticket_sla_%'
GROUP BY type;

COMMIT;
