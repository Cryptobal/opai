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
      }
    } catch {
      toast.error("Error al cargar la presentación");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

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
