"use client";

import { useCallback, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Search,
  Loader2,
  Building2,
  Users,
  ExternalLink,
  Plus,
  Sparkles,
  MapPin,
  Briefcase,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { toast } from "sonner";

type ApolloPersonResult = {
  apolloId: string;
  firstName: string | null;
  lastName: string | null;
  name: string | null;
  title: string | null;
  headline: string | null;
  linkedinUrl: string | null;
  photoUrl: string | null;
  city: string | null;
  country: string | null;
  seniority: string | null;
  departments: string[];
  isLikelyToEngage: boolean;
  organization: {
    name: string | null;
    website: string | null;
    industry: string | null;
    employees: number | null;
    logoUrl: string | null;
  } | null;
};

type ApolloOrgResult = {
  apolloId: string;
  name: string | null;
  website: string | null;
  linkedinUrl: string | null;
  industry: string | null;
  employees: number | null;
  annualRevenue: string | null;
  foundedYear: number | null;
  city: string | null;
  state: string | null;
  country: string | null;
  description: string | null;
  logoUrl: string | null;
  keywords: string[];
  phone: string | null;
};

type SearchMode = "people" | "companies";

export function ApolloProspectingClient() {
  const [mode, setMode] = useState<SearchMode>("companies");
  const [loading, setLoading] = useState(false);
  const [creatingLead, setCreatingLead] = useState<string | null>(null);

  // People search
  const [keywords, setKeywords] = useState("");
  const [personTitles, setPersonTitles] = useState("");
  const [orgDomains, setOrgDomains] = useState("");
  const [locations, setLocations] = useState("");
  const [peopleResults, setPeopleResults] = useState<ApolloPersonResult[]>([]);
  const [peoplePagination, setPeoplePagination] = useState<{ page: number; total_entries: number; total_pages: number } | null>(null);

  // Company search — buscar PROSPECTOS que necesitan guardias, no empresas de seguridad
  const [orgKeywords, setOrgKeywords] = useState("");
  const [orgName, setOrgName] = useState("");
  const [orgLocations, setOrgLocations] = useState("Chile");
  const [orgEmployees, setOrgEmployees] = useState("51,1000");
  const [orgIndustry, setOrgIndustry] = useState("mining,construction,retail,logistics,real estate,manufacturing,hospitality");
  const [orgResults, setOrgResults] = useState<ApolloOrgResult[]>([]);
  const [orgPagination, setOrgPagination] = useState<{ page: number; total_entries: number; total_pages: number } | null>(null);

  const [currentPage, setCurrentPage] = useState(1);

  const searchPeople = useCallback(async (page = 1) => {
    setLoading(true);
    try {
      const body: Record<string, unknown> = { page, per_page: 25 };
      if (keywords.trim()) body.q_keywords = keywords.trim();
      if (personTitles.trim()) body.person_titles = personTitles.split(",").map((t) => t.trim()).filter(Boolean);
      if (orgDomains.trim()) body.organization_domains = orgDomains.split(",").map((d) => d.trim()).filter(Boolean);
      if (locations.trim()) body.person_locations = locations.split(",").map((l) => l.trim()).filter(Boolean);

      const res = await fetch("/api/crm/apollo/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || "Error en búsqueda");
      setPeopleResults(json.data.people || []);
      setPeoplePagination(json.data.pagination);
      setCurrentPage(page);
      if ((json.data.people || []).length === 0) toast.info("No se encontraron resultados. Intenta con otros filtros.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al buscar");
    } finally {
      setLoading(false);
    }
  }, [keywords, personTitles, orgDomains, locations]);

  const searchCompanies = useCallback(async (page = 1) => {
    setLoading(true);
    try {
      const body: Record<string, unknown> = { page, per_page: 25 };
      // Combine industry and keywords as keyword_tags
      const allTags = [
        ...orgIndustry.split(",").map((t) => t.trim()).filter(Boolean),
        ...orgKeywords.split(",").map((t) => t.trim()).filter(Boolean),
      ];
      if (allTags.length > 0) body.q_organization_keyword_tags = allTags;
      if (orgName.trim()) body.q_organization_name = orgName.trim();
      if (orgLocations.trim()) body.organization_locations = orgLocations.split(",").map((l) => l.trim()).filter(Boolean);
      if (orgEmployees.trim()) body.organization_num_employees_ranges = [orgEmployees.trim()];

      const res = await fetch("/api/crm/apollo/org-search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || "Error en búsqueda");

      // Filter out security companies (competitors) from results
      const excludeKeywords = ["security", "seguridad", "vigilancia", "guard", "protective"];
      const filtered = (json.data.organizations || []).filter((o: ApolloOrgResult) => {
        const ind = (o.industry || "").toLowerCase();
        const name = (o.name || "").toLowerCase();
        const kws = (o.keywords || []).map((k: string) => k.toLowerCase()).join(" ");
        return !excludeKeywords.some((ek) => ind.includes(ek) || name.includes(ek) || kws.includes(ek));
      });

      setOrgResults(filtered);
      setOrgPagination(json.data.pagination);
      setCurrentPage(page);
      if (filtered.length === 0) toast.info("No se encontraron prospectos. Intenta con otros filtros o industrias.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al buscar");
    } finally {
      setLoading(false);
    }
  }, [orgKeywords, orgName, orgLocations, orgEmployees, orgIndustry]);

  const createLeadFromPerson = async (person: ApolloPersonResult) => {
    setCreatingLead(person.apolloId);
    try {
      const res = await fetch("/api/crm/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName: person.firstName || "",
          lastName: person.lastName || "",
          companyName: person.organization?.name || "",
          website: person.organization?.website || "",
          industry: person.organization?.industry || "",
          source: "apollo_prospecting",
          metadata: {
            apolloEnrichment: {
              person: {
                title: person.title,
                seniority: person.seniority,
                linkedinUrl: person.linkedinUrl,
                headline: person.headline,
                photoUrl: person.photoUrl,
                city: person.city,
                country: person.country,
                departments: person.departments,
                isLikelyToEngage: person.isLikelyToEngage,
              },
              organization: person.organization ? {
                name: person.organization.name,
                industry: person.organization.industry,
                employees: person.organization.employees,
                website: person.organization.website,
                logoUrl: person.organization.logoUrl,
              } : undefined,
            },
          },
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || "Error creando lead");
      toast.success(`Lead creado: ${person.name || person.firstName}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al crear lead");
    } finally {
      setCreatingLead(null);
    }
  };

  const createLeadFromOrg = async (org: ApolloOrgResult) => {
    setCreatingLead(org.apolloId);
    try {
      const res = await fetch("/api/crm/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyName: org.name || "",
          website: org.website || "",
          industry: org.industry || "",
          source: "apollo_prospecting",
          phone: org.phone || "",
          metadata: {
            apolloEnrichment: {
              organization: {
                name: org.name,
                industry: org.industry,
                employees: org.employees,
                annualRevenue: org.annualRevenue,
                website: org.website,
                description: org.description,
                logoUrl: org.logoUrl,
                keywords: org.keywords,
              },
            },
          },
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || "Error creando lead");
      toast.success(`Lead creado: ${org.name}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al crear lead");
    } finally {
      setCreatingLead(null);
    }
  };

  const pagination = mode === "people" ? peoplePagination : orgPagination;

  return (
    <div className="space-y-4">
      {/* Mode tabs */}
      <div className="flex gap-2">
        <Button
          variant={mode === "companies" ? "default" : "outline"}
          size="sm"
          onClick={() => setMode("companies")}
          className="gap-1.5"
        >
          <Building2 className="h-3.5 w-3.5" />
          Empresas
        </Button>
        <Button
          variant={mode === "people" ? "default" : "outline"}
          size="sm"
          onClick={() => setMode("people")}
          className="gap-1.5"
        >
          <Users className="h-3.5 w-3.5" />
          Personas
          <Badge variant="outline" className="ml-1 text-[10px] px-1.5">Gratis</Badge>
        </Button>
      </div>

      {/* Search filters */}
      <div className="rounded-lg border border-border bg-card p-4 space-y-3">
        {mode === "people" ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Keywords</Label>
              <Input value={keywords} onChange={(e) => setKeywords(e.target.value)} placeholder="guardias, seguridad..." className="h-8 text-sm" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Cargos (separados por coma)</Label>
              <Input value={personTitles} onChange={(e) => setPersonTitles(e.target.value)} placeholder="Gerente Operaciones, Jefe RRHH..." className="h-8 text-sm" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Dominios empresa</Label>
              <Input value={orgDomains} onChange={(e) => setOrgDomains(e.target.value)} placeholder="empresa.cl, otro.com..." className="h-8 text-sm" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Ubicaciones</Label>
              <Input value={locations} onChange={(e) => setLocations(e.target.value)} placeholder="Santiago, Chile..." className="h-8 text-sm" />
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Industrias (separadas por coma)</Label>
              <Input value={orgIndustry} onChange={(e) => setOrgIndustry(e.target.value)} placeholder="mining, construction, retail, logistics..." className="h-8 text-sm" />
              <p className="text-[10px] text-muted-foreground">Empresas de estas industrias que podrían necesitar guardias. Se excluyen empresas de seguridad.</p>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Ubicación</Label>
              <Input value={orgLocations} onChange={(e) => setOrgLocations(e.target.value)} placeholder="Chile, Santiago..." className="h-8 text-sm" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Rango empleados</Label>
              <Input value={orgEmployees} onChange={(e) => setOrgEmployees(e.target.value)} placeholder="51,1000 o 1001,5000..." className="h-8 text-sm" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Keywords adicionales</Label>
              <Input value={orgKeywords} onChange={(e) => setOrgKeywords(e.target.value)} placeholder="Filtros adicionales..." className="h-8 text-sm" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Nombre empresa</Label>
              <Input value={orgName} onChange={(e) => setOrgName(e.target.value)} placeholder="Buscar por nombre..." className="h-8 text-sm" />
            </div>
          </div>
        )}
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            onClick={() => mode === "people" ? searchPeople(1) : searchCompanies(1)}
            disabled={loading}
            className="gap-1.5"
          >
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
            Buscar en Apollo
          </Button>
          {mode === "people" && (
            <span className="text-[10px] text-muted-foreground">La búsqueda de personas no consume créditos Apollo</span>
          )}
        </div>
      </div>

      {/* Results */}
      {mode === "people" && peopleResults.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">
            {peoplePagination?.total_entries ?? 0} resultados encontrados
          </p>
          <div className="grid gap-2">
            {peopleResults.map((p) => (
              <div key={p.apolloId} className="flex items-center gap-3 rounded-lg border border-border bg-card p-3 hover:bg-muted/30 transition-colors">
                {p.photoUrl ? (
                  <img src={p.photoUrl} alt="" className="h-10 w-10 rounded-full bg-muted object-cover shrink-0" />
                ) : (
                  <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center shrink-0">
                    <Users className="h-4 w-4 text-muted-foreground" />
                  </div>
                )}
                <div className="min-w-0 flex-1 space-y-0.5">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium truncate">{p.name || [p.firstName, p.lastName].filter(Boolean).join(" ")}</span>
                    {p.linkedinUrl && (
                      <a href={p.linkedinUrl} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300">
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                    {p.isLikelyToEngage && <Badge className="text-[9px] px-1 bg-emerald-500/20 text-emerald-400 border-emerald-500/30">Engage</Badge>}
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    {p.title && <span className="flex items-center gap-1"><Briefcase className="h-3 w-3" />{p.title}</span>}
                    {p.organization?.name && <span className="flex items-center gap-1"><Building2 className="h-3 w-3" />{p.organization.name}</span>}
                    {(p.city || p.country) && <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{[p.city, p.country].filter(Boolean).join(", ")}</span>}
                  </div>
                  {p.seniority && <Badge variant="outline" className="text-[9px] px-1.5">{p.seniority}</Badge>}
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="shrink-0 h-7 text-xs gap-1"
                  onClick={() => createLeadFromPerson(p)}
                  disabled={creatingLead === p.apolloId}
                >
                  {creatingLead === p.apolloId ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
                  Lead
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      {mode === "companies" && orgResults.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">
            {orgPagination?.total_entries ?? 0} empresas encontradas
          </p>
          <div className="grid gap-2">
            {orgResults.map((o) => (
              <div key={o.apolloId} className="flex items-center gap-3 rounded-lg border border-border bg-card p-3 hover:bg-muted/30 transition-colors">
                {o.logoUrl ? (
                  <img src={o.logoUrl} alt="" className="h-10 w-10 rounded bg-white object-contain shrink-0 p-0.5" />
                ) : (
                  <div className="h-10 w-10 rounded bg-muted flex items-center justify-center shrink-0">
                    <Building2 className="h-4 w-4 text-muted-foreground" />
                  </div>
                )}
                <div className="min-w-0 flex-1 space-y-0.5">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium truncate">{o.name}</span>
                    {o.website && (
                      <a href={o.website.startsWith("http") ? o.website : `https://${o.website}`} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300">
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                    {o.industry && <span>{o.industry}</span>}
                    {o.employees != null && <span>{o.employees} empleados</span>}
                    {o.annualRevenue && <span>{o.annualRevenue}</span>}
                    {(o.city || o.country) && <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{[o.city, o.state, o.country].filter(Boolean).join(", ")}</span>}
                  </div>
                  {o.keywords && o.keywords.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-0.5">
                      {o.keywords.slice(0, 5).map((k) => (
                        <Badge key={k} variant="outline" className="text-[9px] px-1">{k}</Badge>
                      ))}
                    </div>
                  )}
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="shrink-0 h-7 text-xs gap-1"
                  onClick={() => createLeadFromOrg(o)}
                  disabled={creatingLead === o.apolloId}
                >
                  {creatingLead === o.apolloId ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
                  Lead
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Pagination */}
      {pagination && pagination.total_pages > 1 && (
        <div className="flex items-center justify-center gap-3">
          <Button
            size="sm"
            variant="outline"
            disabled={currentPage <= 1 || loading}
            onClick={() => mode === "people" ? searchPeople(currentPage - 1) : searchCompanies(currentPage - 1)}
            className="h-7 text-xs gap-1"
          >
            <ChevronLeft className="h-3 w-3" /> Anterior
          </Button>
          <span className="text-xs text-muted-foreground">
            Página {currentPage} de {pagination.total_pages}
          </span>
          <Button
            size="sm"
            variant="outline"
            disabled={currentPage >= pagination.total_pages || loading}
            onClick={() => mode === "people" ? searchPeople(currentPage + 1) : searchCompanies(currentPage + 1)}
            className="h-7 text-xs gap-1"
          >
            Siguiente <ChevronRight className="h-3 w-3" />
          </Button>
        </div>
      )}
    </div>
  );
}
