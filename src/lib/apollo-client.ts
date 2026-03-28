/**
 * Apollo.io API Client
 *
 * Centralised wrapper around Apollo's REST API for:
 *   - People Enrichment  (POST /api/v1/people/match)
 *   - Organization Enrichment (GET /api/v1/organizations/enrich)
 *   - People Search (POST /api/v1/mixed_people/api_search)  — NO consume créditos
 *   - Organization Search (POST /api/v1/mixed_companies/search)
 *
 * Rate limit: 600 calls / hour.
 * Docs: https://docs.apollo.io/reference
 */

const APOLLO_BASE = "https://api.apollo.io/api/v1";

function getApiKey(): string {
  const key = process.env.APOLLO_API_KEY;
  if (!key) throw new Error("APOLLO_API_KEY no configurada");
  return key;
}

async function apolloFetch<T>(
  path: string,
  opts: { method?: string; body?: Record<string, unknown> } = {}
): Promise<T> {
  const { method = "POST", body } = opts;
  const url = `${APOLLO_BASE}${path}`;
  const res = await fetch(url, {
    method,
    headers: {
      "Content-Type": "application/json",
      "x-api-key": getApiKey(),
      "Cache-Control": "no-cache",
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  if (res.status === 429) {
    throw new Error("Apollo rate limit excedido (600/hora). Intenta más tarde.");
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Apollo API error ${res.status}: ${text}`);
  }
  return res.json() as Promise<T>;
}

// ─── Types ──────────────────────────────────────────────────────────

export type ApolloEmployment = {
  id: string;
  organization_name: string;
  title: string;
  start_date: string | null;
  end_date: string | null;
  current: boolean;
};

export type ApolloPerson = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  name: string | null;
  email: string | null;
  email_status: string | null;
  title: string | null;
  headline: string | null;
  linkedin_url: string | null;
  photo_url: string | null;
  twitter_url: string | null;
  github_url: string | null;
  facebook_url: string | null;
  state: string | null;
  city: string | null;
  country: string | null;
  seniority: string | null;
  departments: string[];
  subdepartments: string[];
  functions: string[];
  is_likely_to_engage: boolean;
  employment_history: ApolloEmployment[];
  organization_id: string | null;
  organization: ApolloOrganization | null;
};

export type ApolloOrganization = {
  id: string;
  name: string | null;
  website_url: string | null;
  linkedin_url: string | null;
  industry: string | null;
  estimated_num_employees: number | null;
  founded_year: number | null;
  annual_revenue: number | null;
  annual_revenue_printed: string | null;
  total_funding: number | null;
  total_funding_printed: string | null;
  latest_funding_stage: string | null;
  phone: string | null;
  street_address: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  postal_code: string | null;
  short_description: string | null;
  seo_description: string | null;
  logo_url: string | null;
  keywords: string[];
  technologies: string[];
  current_technologies: { name: string; category: string }[];
};

// ─── People Enrichment ─────────────────────────────────────────────

export type PeopleEnrichParams = {
  first_name?: string;
  last_name?: string;
  name?: string;
  email?: string;
  domain?: string;
  organization_name?: string;
  linkedin_url?: string;
  id?: string;
  reveal_personal_emails?: boolean;
  reveal_phone_number?: boolean;
};

export type PeopleEnrichResponse = {
  person: ApolloPerson | null;
  organization: ApolloOrganization | null;
};

export async function enrichPerson(
  params: PeopleEnrichParams
): Promise<PeopleEnrichResponse> {
  return apolloFetch<PeopleEnrichResponse>("/people/match", { body: params });
}

// ─── Organization Enrichment ────────────────────────────────────────

export type OrgEnrichParams = {
  domain?: string;
  name?: string;
};

export type OrgEnrichResponse = {
  organization: ApolloOrganization | null;
};

export async function enrichOrganization(
  params: OrgEnrichParams
): Promise<OrgEnrichResponse> {
  const qs = new URLSearchParams();
  if (params.domain) qs.set("domain", params.domain);
  if (params.name) qs.set("name", params.name);
  return apolloFetch<OrgEnrichResponse>(`/organizations/enrich?${qs.toString()}`, {
    method: "GET",
  });
}

// ─── People Search (NO consume créditos) ────────────────────────────

export type PeopleSearchParams = {
  person_titles?: string[];
  person_seniorities?: string[];
  person_locations?: string[];
  q_keywords?: string;
  organization_domains?: string[];
  organization_ids?: string[];
  organization_locations?: string[];
  organization_num_employees_ranges?: string[];
  per_page?: number;
  page?: number;
};

export type PeopleSearchResponse = {
  people: ApolloPerson[];
  pagination: {
    page: number;
    per_page: number;
    total_entries: number;
    total_pages: number;
  };
};

export async function searchPeople(
  params: PeopleSearchParams
): Promise<PeopleSearchResponse> {
  return apolloFetch<PeopleSearchResponse>("/mixed_people/api_search", {
    body: { ...params, per_page: params.per_page ?? 25 },
  });
}

// ─── Organization Search ────────────────────────────────────────────

export type OrgSearchParams = {
  q_organization_keyword_tags?: string[];
  q_organization_name?: string;
  organization_locations?: string[];
  organization_num_employees_ranges?: string[];
  revenue_range?: { min?: number; max?: number };
  organization_industry_tag_ids?: string[];
  per_page?: number;
  page?: number;
};

type ApolloAccount = {
  id: string;
  name: string | null;
  domain: string | null;
  website_url: string | null;
  linkedin_url: string | null;
  logo_url: string | null;
  phone: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  organization_city: string | null;
  organization_country: string | null;
  organization_state: string | null;
  organization_revenue_printed: string | null;
  organization_revenue: number | null;
  industry: string | null;
  founded_year: number | null;
  intent_strength: string | null;
};

type RawOrgSearchResponse = {
  accounts: ApolloAccount[];
  pagination: {
    page: number;
    per_page: number;
    total_entries: number;
    total_pages: number;
  };
};

export type OrgSearchResponse = {
  organizations: ApolloOrganization[];
  pagination: {
    page: number;
    per_page: number;
    total_entries: number;
    total_pages: number;
  };
};

export async function searchOrganizations(
  params: OrgSearchParams
): Promise<OrgSearchResponse> {
  const raw = await apolloFetch<RawOrgSearchResponse>("/mixed_companies/search", {
    body: { ...params, per_page: params.per_page ?? 25 },
  });
  // Apollo returns data in "accounts" not "organizations"
  return {
    organizations: (raw.accounts || []).map((a) => ({
      id: a.id,
      name: a.name,
      website_url: a.website_url || (a.domain ? `https://${a.domain}` : null),
      linkedin_url: a.linkedin_url,
      industry: a.industry,
      estimated_num_employees: null,
      founded_year: a.founded_year,
      annual_revenue: a.organization_revenue,
      annual_revenue_printed: a.organization_revenue_printed,
      total_funding: null,
      total_funding_printed: null,
      latest_funding_stage: null,
      phone: a.phone,
      street_address: null,
      city: a.organization_city || a.city,
      state: a.organization_state || a.state,
      country: a.organization_country || a.country,
      postal_code: null,
      short_description: null,
      seo_description: null,
      logo_url: a.logo_url,
      keywords: [],
      technologies: [],
      current_technologies: [],
    })),
    pagination: raw.pagination,
  };
}
