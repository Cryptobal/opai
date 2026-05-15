-- ────────────────────────────────────────────────────────────────────────────
-- Búsqueda global tolerante a tildes/diacríticos
-- Habilita unaccent + pg_trgm, expone f_unaccent IMMUTABLE para indexar,
-- y crea índices GIN trigram sobre los campos de texto más buscados desde
-- el command palette (CRM, Ops, CPQ).
-- Problema original: "Muñoz" no matcheaba "munoz" porque mode:"insensitive"
-- de Prisma solo es case-insensitive, no accent-insensitive.
-- ────────────────────────────────────────────────────────────────────────────

CREATE EXTENSION IF NOT EXISTS unaccent;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Wrapper IMMUTABLE de unaccent. La función nativa unaccent() está marcada
-- STABLE (no IMMUTABLE) por PostgreSQL porque depende de un diccionario que
-- podría recargarse. Para usar unaccent en índices funcionales necesitamos
-- una versión IMMUTABLE, asumiendo que el diccionario "unaccent" por defecto
-- no se modifica en producción.
CREATE OR REPLACE FUNCTION public.f_unaccent(text)
  RETURNS text
  LANGUAGE sql
  IMMUTABLE
  PARALLEL SAFE
  STRICT
  AS $$ SELECT public.unaccent('public.unaccent'::regdictionary, $1) $$;

-- ── Índices GIN trigram para fuzzy + accent-insensitive search ──
-- Cada índice cubre `lower(f_unaccent(field))` con `gin_trgm_ops`, que soporta
-- ILIKE/LIKE con wildcards y queries cortos (≥ 2-3 chars). Se usan IF NOT
-- EXISTS para idempotencia.

-- CRM Contacts (firstName, lastName)
CREATE INDEX IF NOT EXISTS idx_crm_contacts_first_name_unaccent
  ON crm.contacts USING gin (LOWER(public.f_unaccent(first_name)) gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_crm_contacts_last_name_unaccent
  ON crm.contacts USING gin (LOWER(public.f_unaccent(last_name)) gin_trgm_ops);

-- CRM Accounts (name, industry, legal_name, legal_representative_name)
CREATE INDEX IF NOT EXISTS idx_crm_accounts_name_unaccent
  ON crm.accounts USING gin (LOWER(public.f_unaccent(name)) gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_crm_accounts_industry_unaccent
  ON crm.accounts USING gin (LOWER(public.f_unaccent(COALESCE(industry, ''))) gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_crm_accounts_legal_name_unaccent
  ON crm.accounts USING gin (LOWER(public.f_unaccent(COALESCE(legal_name, ''))) gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_crm_accounts_legal_rep_name_unaccent
  ON crm.accounts USING gin (LOWER(public.f_unaccent(COALESCE(legal_representative_name, ''))) gin_trgm_ops);

-- CRM Leads (firstName, lastName, companyName)
CREATE INDEX IF NOT EXISTS idx_crm_leads_first_name_unaccent
  ON crm.leads USING gin (LOWER(public.f_unaccent(COALESCE(first_name, ''))) gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_crm_leads_last_name_unaccent
  ON crm.leads USING gin (LOWER(public.f_unaccent(COALESCE(last_name, ''))) gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_crm_leads_company_name_unaccent
  ON crm.leads USING gin (LOWER(public.f_unaccent(COALESCE(company_name, ''))) gin_trgm_ops);

-- CRM Deals (title)
CREATE INDEX IF NOT EXISTS idx_crm_deals_title_unaccent
  ON crm.deals USING gin (LOWER(public.f_unaccent(title)) gin_trgm_ops);

-- CRM Installations (name, address, commune, city)
CREATE INDEX IF NOT EXISTS idx_crm_installations_name_unaccent
  ON crm.installations USING gin (LOWER(public.f_unaccent(name)) gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_crm_installations_address_unaccent
  ON crm.installations USING gin (LOWER(public.f_unaccent(COALESCE(address, ''))) gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_crm_installations_commune_unaccent
  ON crm.installations USING gin (LOWER(public.f_unaccent(COALESCE(commune, ''))) gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_crm_installations_city_unaccent
  ON crm.installations USING gin (LOWER(public.f_unaccent(COALESCE(city, ''))) gin_trgm_ops);

-- CPQ Quotes (code, name, clientName, notes)
CREATE INDEX IF NOT EXISTS idx_cpq_quotes_code_unaccent
  ON cpq.quotes USING gin (LOWER(public.f_unaccent(code)) gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_cpq_quotes_name_unaccent
  ON cpq.quotes USING gin (LOWER(public.f_unaccent(COALESCE(name, ''))) gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_cpq_quotes_client_name_unaccent
  ON cpq.quotes USING gin (LOWER(public.f_unaccent(COALESCE(client_name, ''))) gin_trgm_ops);

-- Ops Personas (firstName, lastName) — usado para búsqueda de guardias
CREATE INDEX IF NOT EXISTS idx_personas_first_name_unaccent
  ON ops.personas USING gin (LOWER(public.f_unaccent(first_name)) gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_personas_last_name_unaccent
  ON ops.personas USING gin (LOWER(public.f_unaccent(last_name)) gin_trgm_ops);

-- Ops Guardias (code)
CREATE INDEX IF NOT EXISTS idx_ops_guardias_code_unaccent
  ON ops.guardias USING gin (LOWER(public.f_unaccent(COALESCE(code, ''))) gin_trgm_ops);
