-- Índices GIN trigram para buscador global (palette): tareas, tickets, agenda.
-- Expresiones idénticas carácter a carácter a findCrmTaskIdsBySearch /
-- findOpsTicketIdsBySearch / findCalendarEventIdsBySearch en search-normalize.ts.
-- Requiere: pg_trgm + public.f_unaccent (migración 20260916000000).
-- Rollback: DROP INDEX IF EXISTS crm.idx_crm_tasks_title_trgm;
--           DROP INDEX IF EXISTS ops.idx_ops_tickets_title_trgm;
--           DROP INDEX IF EXISTS ops.idx_ops_tickets_code_trgm;
--           DROP INDEX IF EXISTS public.idx_calendar_events_title_trgm;

CREATE INDEX IF NOT EXISTS idx_crm_tasks_title_trgm
  ON crm.tasks USING gin (LOWER(public.f_unaccent(title)) gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_ops_tickets_title_trgm
  ON ops.ops_tickets USING gin (LOWER(public.f_unaccent(title)) gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_ops_tickets_code_trgm
  ON ops.ops_tickets USING gin (LOWER(public.f_unaccent(code)) gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_calendar_events_title_trgm
  ON public.calendar_events USING gin (LOWER(public.f_unaccent(title)) gin_trgm_ops);
