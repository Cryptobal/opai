"use client";

/**
 * Editor de la "Presentación de Empresa" del tenant (portal del cliente).
 * Persiste en Setting bajo `empresa.presentacion.*` vía PATCH
 * /api/configuracion/empresa (solo estas 4 claves; el PATCH es parcial).
 *
 * Es autocontenido: carga e inicializa su propio estado y guarda solo sus
 * claves, sin acoplarse al form gigante de EmpresaConfigTabs.
 */
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, Plus, Save, Sparkles, Trash2, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { GARD_PRESENTATION_CONTENT } from "@/lib/tenant-presentation-defaults";
import { resolveAccountLogo } from "@/lib/crm/account-logo";
import type { PresentationSection, PresentationStat } from "@/lib/tenant-presentation";

const KNOWN_SECTION_KEYS: { value: string; hint: string }[] = [
  { value: "seguridad", hint: "🛡️ azul" },
  { value: "tecnologia", hint: "💻 violeta" },
  { value: "cumplimiento", hint: "📋 azul" },
  { value: "diferenciadores", hint: "⭐ ámbar" },
  { value: "certificaciones", hint: "🏆 verde" },
  { value: "portal", hint: "📱 azul" },
];

function safeParseArray<T>(raw: string | undefined): T[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

export function PresentacionConfigSection() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [valueProp, setValueProp] = useState("");
  const [stats, setStats] = useState<PresentationStat[]>([]);
  const [sections, setSections] = useState<PresentationSection[]>([]);
  const [serviceIncludes, setServiceIncludes] = useState<string[]>([]);

  // ── Propuesta Técnica (PDF) ──
  const [proposalCfg, setProposalCfg] = useState<Record<string, string>>({});
  const [excludedIds, setExcludedIds] = useState<string[]>([]);
  const [clientAccounts, setClientAccounts] = useState<Array<{ id: string; name: string; hasLogo: boolean }>>([]);
  const [clientSearch, setClientSearch] = useState("");

  const setProp = (key: string, value: string) =>
    setProposalCfg((prev) => ({ ...prev, [key]: value }));

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/configuracion/empresa");
      const data = await res.json();
      if (data.success) {
        const d = data.data as Record<string, string>;
        setValueProp(d["empresa.presentacion.valueProp"] ?? "");
        setStats(safeParseArray<PresentationStat>(d["empresa.presentacion.stats"]));
        setSections(safeParseArray<PresentationSection>(d["empresa.presentacion.sections"]));
        setServiceIncludes(
          safeParseArray<string>(d["empresa.presentacion.serviceIncludes"]),
        );
        setProposalCfg({
          "empresa.proposal.yearsInOperation": d["empresa.proposal.yearsInOperation"] ?? "",
          "empresa.proposal.activeGuards": d["empresa.proposal.activeGuards"] ?? "",
          "empresa.proposal.protectedFacilities": d["empresa.proposal.protectedFacilities"] ?? "",
          "empresa.proposal.regionsCount": d["empresa.proposal.regionsCount"] ?? "",
          "empresa.proposal.metricIncidentReduction": d["empresa.proposal.metricIncidentReduction"] ?? "",
          "empresa.proposal.metricRoundsCompliance": d["empresa.proposal.metricRoundsCompliance"] ?? "",
          "empresa.proposal.metricDocumented": d["empresa.proposal.metricDocumented"] ?? "",
          "empresa.proposal.metricRenewalRate": d["empresa.proposal.metricRenewalRate"] ?? "",
          "empresa.proposal.metricSatisfaction": d["empresa.proposal.metricSatisfaction"] ?? "",
        });
        setExcludedIds(safeParseArray<string>(d["empresa.proposal.excludedAccountIds"]));
      }
    } catch {
      toast.error("Error al cargar la presentación");
    } finally {
      setLoading(false);
    }
  }, []);

  // Cargar clientes activos para el selector de exclusión (misma lógica getLifecycle)
  const loadClients = useCallback(async () => {
    try {
      const res = await fetch("/api/crm/accounts");
      const data = await res.json();
      const rows: Array<{ id: string; name: string; status?: string | null; isActive?: boolean; logoUrl?: string | null; notes?: string | null }> =
        data?.data ?? data?.accounts ?? [];
      const isActive = (a: { status?: string | null; isActive?: boolean }) => {
        if (a.status === "prospect") return false;
        if (a.status === "client_active") return true;
        if (a.status === "client_inactive") return false;
        return a.isActive === true;
      };
      setClientAccounts(
        rows
          .filter(isActive)
          .map((a) => ({ id: a.id, name: a.name, hasLogo: Boolean(resolveAccountLogo(a)) }))
          // Los que tienen logo primero (son los que aparecen en el muro).
          .sort((a, b) => (Number(b.hasLogo) - Number(a.hasLogo)) || a.name.localeCompare(b.name)),
      );
    } catch {
      /* silencioso: el selector simplemente queda vacío */
    }
  }, []);

  useEffect(() => {
    void load();
    void loadClients();
  }, [load, loadClients]);

  const isEmpty =
    !valueProp.trim() &&
    stats.length === 0 &&
    sections.length === 0 &&
    serviceIncludes.length === 0;

  function loadTemplate() {
    setValueProp(GARD_PRESENTATION_CONTENT.valueProp);
    setStats(GARD_PRESENTATION_CONTENT.stats.map((s) => ({ ...s })));
    setSections(
      GARD_PRESENTATION_CONTENT.sections.map((s) => ({ ...s, items: [...s.items] })),
    );
    setServiceIncludes([...GARD_PRESENTATION_CONTENT.serviceIncludes]);
    toast.success("Plantilla base cargada — edítala y guarda");
  }

  async function handleSave() {
    setSaving(true);
    try {
      // Limpiar vacíos antes de persistir.
      const cleanStats = stats
        .map((s) => ({ value: s.value.trim(), label: s.label.trim() }))
        .filter((s) => s.value && s.label);
      const cleanSections = sections
        .map((s) => ({
          key: s.key.trim(),
          title: s.title.trim(),
          items: s.items.map((i) => i.trim()).filter(Boolean),
        }))
        .filter((s) => s.title && s.items.length > 0);
      const cleanIncludes = serviceIncludes.map((i) => i.trim()).filter(Boolean);

      const payload = {
        "empresa.presentacion.valueProp": valueProp.trim(),
        "empresa.presentacion.stats": JSON.stringify(cleanStats),
        "empresa.presentacion.sections": JSON.stringify(cleanSections),
        "empresa.presentacion.serviceIncludes": JSON.stringify(cleanIncludes),
        // Propuesta Técnica
        ...Object.fromEntries(
          Object.entries(proposalCfg).map(([k, v]) => [k, (v ?? "").trim()]),
        ),
        "empresa.proposal.excludedAccountIds": JSON.stringify(excludedIds),
      };

      const res = await fetch("/api/configuracion/empresa", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      toast.success("Presentación guardada");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al guardar");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground p-6">
        <Loader2 className="h-4 w-4 animate-spin" /> Cargando…
      </div>
    );
  }

  return (
    <div className="max-w-2xl space-y-6">
      {/* Intro */}
      <div className="rounded-lg border border-border p-6 space-y-4">
        <div className="flex items-center gap-2">
          <Sparkles className="h-[18px] w-[18px] text-muted-foreground" />
          <h3 className="font-semibold">Presentación de empresa</h3>
        </div>
        <p className="text-sm text-muted-foreground">
          Es lo que verá un lead/prospecto en el portal del cliente cuando le envíes la
          presentación. Si dejas algo vacío, se usa el contenido por defecto.
        </p>
        {isEmpty && (
          <Button variant="outline" size="sm" onClick={loadTemplate} className="gap-1.5">
            <Wand2 className="h-4 w-4" /> Usar plantilla base
          </Button>
        )}

        {/* Propuesta de valor */}
        <div className="space-y-1.5">
          <Label>Propuesta de valor (subtítulo del hero)</Label>
          <Textarea
            value={valueProp}
            onChange={(e) => setValueProp(e.target.value)}
            placeholder="Ej: Seguridad privada con tecnología propia…"
            rows={2}
          />
        </div>
      </div>

      {/* Estadísticas */}
      <div className="rounded-lg border border-border p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-sm">Estadísticas destacadas</h3>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setStats((p) => [...p, { value: "", label: "" }])}
            className="gap-1.5 h-7 px-2 text-xs"
          >
            <Plus className="h-3.5 w-3.5" /> Agregar
          </Button>
        </div>
        {stats.length === 0 && (
          <p className="text-xs text-muted-foreground">Sin estadísticas.</p>
        )}
        {stats.map((stat, i) => (
          <div key={i} className="flex items-center gap-2">
            <Input
              value={stat.value}
              onChange={(e) =>
                setStats((p) => p.map((s, j) => (j === i ? { ...s, value: e.target.value } : s)))
              }
              placeholder="150+"
              className="w-28"
            />
            <Input
              value={stat.label}
              onChange={(e) =>
                setStats((p) => p.map((s, j) => (j === i ? { ...s, label: e.target.value } : s)))
              }
              placeholder="Clientes activos"
              className="flex-1"
            />
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setStats((p) => p.filter((_, j) => j !== i))}
              className="h-9 w-9 p-0 text-muted-foreground hover:text-destructive"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}
      </div>

      {/* Secciones */}
      <div className="rounded-lg border border-border p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-sm">Secciones</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Un ítem por línea. La «clave» define el ícono/color.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              setSections((p) => [...p, { key: "diferenciadores", title: "", items: [] }])
            }
            className="gap-1.5 h-7 px-2 text-xs"
          >
            <Plus className="h-3.5 w-3.5" /> Agregar
          </Button>
        </div>
        {sections.length === 0 && (
          <p className="text-xs text-muted-foreground">Sin secciones.</p>
        )}
        {sections.map((section, i) => (
          <div key={i} className="rounded-md border border-border/60 p-4 space-y-3">
            <div className="flex items-center gap-2">
              <select
                value={section.key}
                onChange={(e) =>
                  setSections((p) => p.map((s, j) => (j === i ? { ...s, key: e.target.value } : s)))
                }
                className="h-9 rounded-md border border-input bg-background px-2 text-sm"
              >
                {KNOWN_SECTION_KEYS.map((k) => (
                  <option key={k.value} value={k.value}>
                    {k.value} ({k.hint})
                  </option>
                ))}
                {!KNOWN_SECTION_KEYS.some((k) => k.value === section.key) && (
                  <option value={section.key}>{section.key}</option>
                )}
              </select>
              <Input
                value={section.title}
                onChange={(e) =>
                  setSections((p) =>
                    p.map((s, j) => (j === i ? { ...s, title: e.target.value } : s)),
                  )
                }
                placeholder="Título de la sección"
                className="flex-1"
              />
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSections((p) => p.filter((_, j) => j !== i))}
                className="h-9 w-9 p-0 text-muted-foreground hover:text-destructive"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
            <Textarea
              value={section.items.join("\n")}
              onChange={(e) =>
                setSections((p) =>
                  p.map((s, j) =>
                    j === i ? { ...s, items: e.target.value.split("\n") } : s,
                  ),
                )
              }
              placeholder={"Un beneficio por línea\nOtro beneficio…"}
              rows={4}
            />
          </div>
        ))}
      </div>

      {/* Qué incluye el servicio */}
      <div className="rounded-lg border border-border p-6 space-y-3">
        <div>
          <h3 className="font-semibold text-sm">Qué incluye el servicio</h3>
          <p className="text-xs text-muted-foreground mt-0.5">Un ítem por línea.</p>
        </div>
        <Textarea
          value={serviceIncludes.join("\n")}
          onChange={(e) => setServiceIncludes(e.target.value.split("\n"))}
          placeholder={"Rondas GPS en tiempo real\nPortal de cliente 24/7\n…"}
          rows={6}
        />
      </div>

      {/* Propuesta Técnica — cifras y métricas */}
      <div className="rounded-lg border border-border p-6 space-y-4">
        <div>
          <h3 className="font-semibold text-sm">Propuesta Técnica · cifras y métricas</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Aparecen en la portada y en la sección «Resultados» del PDF. Si dejas un campo
            vacío, esa cifra no se muestra (no inventamos datos).
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { key: "empresa.proposal.yearsInOperation", label: "Años operando", ph: "8" },
            { key: "empresa.proposal.activeGuards", label: "Guardias activos", ph: "120+" },
            { key: "empresa.proposal.protectedFacilities", label: "Instalaciones", ph: "45+" },
            { key: "empresa.proposal.regionsCount", label: "Regiones", ph: "5" },
          ].map((f) => (
            <div key={f.key}>
              <Label className="text-xs mb-1.5">{f.label}</Label>
              <Input
                value={proposalCfg[f.key] ?? ""}
                onChange={(e) => setProp(f.key, e.target.value)}
                placeholder={f.ph}
                className="text-sm"
              />
            </div>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {[
            { key: "empresa.proposal.metricIncidentReduction", label: "Reducción incidentes", ph: "67%" },
            { key: "empresa.proposal.metricRoundsCompliance", label: "Cumplimiento rondas", ph: "96%" },
            { key: "empresa.proposal.metricDocumented", label: "Documentado", ph: "100%" },
            { key: "empresa.proposal.metricRenewalRate", label: "Tasa de renovación", ph: "94%" },
            { key: "empresa.proposal.metricSatisfaction", label: "Satisfacción (de 5.0)", ph: "4.8" },
          ].map((f) => (
            <div key={f.key}>
              <Label className="text-xs mb-1.5">{f.label}</Label>
              <Input
                value={proposalCfg[f.key] ?? ""}
                onChange={(e) => setProp(f.key, e.target.value)}
                placeholder={f.ph}
                className="text-sm"
              />
            </div>
          ))}
        </div>
      </div>

      {/* Propuesta Técnica — exclusión de clientes */}
      <div className="rounded-lg border border-border p-6 space-y-3">
        <div>
          <h3 className="font-semibold text-sm">Clientes en la propuesta</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            En el muro «Clientes que confían en nosotros» solo aparecen los clientes activos
            que <strong>tienen logo</strong>. Los marcados «Sin logo» no se muestran hasta que
            les cargues una imagen. Oculta los que no quieras incluir (ej: cuentas internas).
            {excludedIds.length > 0 ? ` ${excludedIds.length} oculto(s).` : ""}
          </p>
        </div>
        <Input
          value={clientSearch}
          onChange={(e) => setClientSearch(e.target.value)}
          placeholder="Buscar cliente…"
          className="text-sm"
        />
        <div className="max-h-72 overflow-y-auto rounded-md border border-border/60 divide-y divide-border/50">
          {clientAccounts.length === 0 && (
            <p className="text-xs text-muted-foreground p-3">No hay clientes activos.</p>
          )}
          {clientAccounts
            .filter((c) => c.name.toLowerCase().includes(clientSearch.toLowerCase()))
            .map((c) => {
              const hidden = excludedIds.includes(c.id);
              return (
                <div key={c.id} className="flex items-center justify-between gap-2 px-3 py-2">
                  <span className="flex items-center gap-2 min-w-0">
                    <span className={hidden ? "text-sm text-muted-foreground line-through truncate" : "text-sm truncate"}>
                      {c.name}
                    </span>
                    {!c.hasLogo && (
                      <span className="shrink-0 rounded px-1.5 py-0.5 text-[11px] font-medium bg-status-warn-soft text-status-warn-fg border border-status-warn-border">
                        Sin logo
                      </span>
                    )}
                  </span>
                  <Button
                    variant={hidden ? "outline" : "ghost"}
                    size="sm"
                    className="h-7 px-2 text-xs"
                    onClick={() =>
                      setExcludedIds((prev) =>
                        hidden ? prev.filter((x) => x !== c.id) : [...prev, c.id],
                      )
                    }
                  >
                    {hidden ? "Oculto" : "Visible"}
                  </Button>
                </div>
              );
            })}
        </div>
      </div>

      {/* Guardar */}
      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving} className="gap-1.5">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Guardar presentación
        </Button>
      </div>
    </div>
  );
}
