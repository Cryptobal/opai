"use client";

import { useCallback, useEffect, useState } from "react";
import { FileText, Gauge, Library, Loader2, Plus, Save } from "lucide-react";
import { toast } from "sonner";
import { IconBubble, Spinner, Surface, Tag } from "@/components/opai-ds";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";

type FixedSection = {
  id: string;
  key: string;
  title: string;
  content: string;
  sortOrder: number;
  isActive: boolean;
};

type ProposalIndicator = {
  id: string;
  label: string;
  value: string;
  metricKey?: string | null;
  visible: boolean;
};

const EMPTY_SECTION = { title: "", content: "" };

async function readApiResponse(response: Response) {
  const payload = await response.json();
  if (!response.ok || !payload.success) {
    throw new Error(payload?.error || "No se pudo completar la operación");
  }
  return payload;
}

export function CpqInstitutionalConfig() {
  const [sections, setSections] = useState<FixedSection[]>([]);
  const [indicators, setIndicators] = useState<ProposalIndicator[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingSectionKey, setSavingSectionKey] = useState<string | null>(null);
  const [savingIndicators, setSavingIndicators] = useState(false);
  const [showCreateSection, setShowCreateSection] = useState(false);
  const [newSection, setNewSection] = useState(EMPTY_SECTION);
  const [creatingSection, setCreatingSection] = useState(false);

  const loadConfig = useCallback(async () => {
    setLoading(true);
    try {
      const [sectionsResponse, indicatorsResponse] = await Promise.all([
        fetch("/api/cpq/fixed-sections", { cache: "no-store" }),
        fetch("/api/cpq/proposal-indicators", { cache: "no-store" }),
      ]);
      const [sectionsPayload, indicatorsPayload] = await Promise.all([
        readApiResponse(sectionsResponse),
        readApiResponse(indicatorsResponse),
      ]);
      setSections(sectionsPayload.data ?? []);
      setIndicators(indicatorsPayload.data ?? []);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "No se pudo cargar la configuración institucional",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadConfig();
  }, [loadConfig]);

  const updateSection = (
    key: string,
    patch: Partial<Pick<FixedSection, "title" | "content" | "sortOrder" | "isActive">>,
  ) => {
    setSections((current) =>
      current.map((section) =>
        section.key === key ? { ...section, ...patch } : section,
      ),
    );
  };

  const saveSection = async (section: FixedSection) => {
    setSavingSectionKey(section.key);
    try {
      const payload = await readApiResponse(
        await fetch("/api/cpq/fixed-sections", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            key: section.key,
            title: section.title,
            content: section.content,
            sortOrder: section.sortOrder,
            isActive: section.isActive,
          }),
        }),
      );
      setSections((current) =>
        current
          .map((item) => (item.key === section.key ? payload.data : item))
          .sort((a, b) => a.sortOrder - b.sortOrder || a.title.localeCompare(b.title)),
      );
      toast.success("Sección fija guardada");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo guardar la sección");
    } finally {
      setSavingSectionKey(null);
    }
  };

  const createSection = async () => {
    if (!newSection.title.trim()) {
      toast.error("El título es obligatorio");
      return;
    }
    setCreatingSection(true);
    try {
      const payload = await readApiResponse(
        await fetch("/api/cpq/fixed-sections", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(newSection),
        }),
      );
      setSections((current) =>
        [...current, payload.data].sort(
          (a, b) => a.sortOrder - b.sortOrder || a.title.localeCompare(b.title),
        ),
      );
      setNewSection(EMPTY_SECTION);
      setShowCreateSection(false);
      toast.success("Sección fija creada");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo crear la sección");
    } finally {
      setCreatingSection(false);
    }
  };

  const updateIndicator = (
    id: string,
    patch: Partial<Pick<ProposalIndicator, "label" | "value" | "visible">>,
  ) => {
    setIndicators((current) =>
      current.map((indicator) =>
        indicator.id === id ? { ...indicator, ...patch } : indicator,
      ),
    );
  };

  const saveIndicators = async () => {
    setSavingIndicators(true);
    try {
      const payload = await readApiResponse(
        await fetch("/api/cpq/proposal-indicators", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ proposalIndicators: indicators }),
        }),
      );
      setIndicators(payload.data ?? []);
      toast.success("Indicadores guardados");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudieron guardar los indicadores");
    } finally {
      setSavingIndicators(false);
    }
  };

  if (loading) {
    return (
      <Surface padding="md">
        <Spinner block label="Cargando configuración institucional…" />
      </Surface>
    );
  }

  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <IconBubble icon={Library} variant="brand" size="md" />
            <div>
              <h2 className="font-display text-base font-semibold text-ds-text-1">
                Biblioteca de secciones fijas
              </h2>
              <p className="text-[13px] text-ds-text-3">
                Administra el contenido institucional reutilizable y su orden en las propuestas.
              </p>
            </div>
          </div>
          <Button
            type="button"
            variant="outline"
            className="h-10 gap-2 sm:h-9"
            onClick={() => setShowCreateSection((current) => !current)}
          >
            <Plus className="h-4 w-4" />
            Nueva sección
          </Button>
        </div>

        {showCreateSection && (
          <Surface elevation={2} padding="md" accent="brand">
            <div className="space-y-3">
              <div>
                <h3 className="font-display text-sm font-semibold text-ds-text-1">
                  Nueva sección fija
                </h3>
                <p className="text-[13px] text-ds-text-3">
                  Se agregará al final de la biblioteca y quedará activa.
                </p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="new-fixed-section-title">Título</Label>
                <Input
                  id="new-fixed-section-title"
                  value={newSection.title}
                  onChange={(event) =>
                    setNewSection((current) => ({ ...current, title: event.target.value }))
                  }
                  className="h-10 sm:h-9"
                  placeholder="Ej: Modelo de servicio"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="new-fixed-section-content">Contenido</Label>
                <Textarea
                  id="new-fixed-section-content"
                  value={newSection.content}
                  onChange={(event) =>
                    setNewSection((current) => ({ ...current, content: event.target.value }))
                  }
                  className="min-h-32"
                  placeholder="Escribe el contenido institucional de la sección…"
                />
              </div>
              <div className="flex flex-wrap justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="h-10 sm:h-9"
                  onClick={() => {
                    setNewSection(EMPTY_SECTION);
                    setShowCreateSection(false);
                  }}
                >
                  Cancelar
                </Button>
                <Button
                  type="button"
                  className="h-10 gap-2 sm:h-9"
                  disabled={creatingSection || !newSection.title.trim()}
                  onClick={createSection}
                >
                  {creatingSection ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Plus className="h-4 w-4" />
                  )}
                  Crear sección
                </Button>
              </div>
            </div>
          </Surface>
        )}

        <div className="ds-list-cascade space-y-3">
          {sections.map((section) => (
            <Surface
              key={section.id}
              padding="md"
              accent={section.isActive ? "brand" : "neutral"}
              className={!section.isActive ? "opacity-75" : undefined}
            >
              <div className="space-y-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="flex min-w-0 items-center gap-3">
                    <IconBubble icon={FileText} variant="neutral" size="sm" />
                    <div className="min-w-0">
                      <p className="truncate font-mono text-[12px] text-ds-text-4">
                        {section.key}
                      </p>
                      <Tag variant={section.isActive ? "ok" : "neutral"} size="md" dot>
                        {section.isActive ? "Activa" : "Inactiva"}
                      </Tag>
                    </div>
                  </div>
                  <label className="flex min-h-11 items-center justify-between gap-3 sm:justify-end">
                    <span className="text-[13px] font-medium text-ds-text-2">
                      Publicar sección
                    </span>
                    <Switch
                      size="lg"
                      checked={section.isActive}
                      onCheckedChange={(isActive) =>
                        updateSection(section.key, { isActive })
                      }
                      aria-label={`Publicar ${section.title}`}
                    />
                  </label>
                </div>

                <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_8rem]">
                  <div className="space-y-1.5">
                    <Label htmlFor={`fixed-title-${section.id}`}>Título</Label>
                    <Input
                      id={`fixed-title-${section.id}`}
                      value={section.title}
                      onChange={(event) =>
                        updateSection(section.key, { title: event.target.value })
                      }
                      className="h-10 sm:h-9"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor={`fixed-order-${section.id}`}>Orden</Label>
                    <Input
                      id={`fixed-order-${section.id}`}
                      type="number"
                      min={0}
                      max={100000}
                      value={section.sortOrder}
                      onChange={(event) =>
                        updateSection(section.key, {
                          sortOrder: Number(event.target.value),
                        })
                      }
                      className="h-10 sm:h-9"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor={`fixed-content-${section.id}`}>Contenido</Label>
                  <Textarea
                    id={`fixed-content-${section.id}`}
                    value={section.content}
                    onChange={(event) =>
                      updateSection(section.key, { content: event.target.value })
                    }
                    className="min-h-40"
                  />
                </div>

                <div className="flex justify-end">
                  <Button
                    type="button"
                    className="h-10 gap-2 sm:h-9"
                    disabled={
                      savingSectionKey === section.key ||
                      !section.title.trim() ||
                      !Number.isInteger(section.sortOrder)
                    }
                    onClick={() => saveSection(section)}
                  >
                    {savingSectionKey === section.key ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Save className="h-4 w-4" />
                    )}
                    Guardar sección
                  </Button>
                </div>
              </div>
            </Surface>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex items-start gap-3">
          <IconBubble icon={Gauge} variant="info" size="md" />
          <div>
            <h2 className="font-display text-base font-semibold text-ds-text-1">
              Indicadores publicables
            </h2>
            <p className="text-[13px] text-ds-text-3">
              Define las cifras institucionales visibles en el PDF. Los indicadores permanecen
              ocultos hasta que los actives.
            </p>
          </div>
        </div>

        <Surface padding="md">
          <div className="space-y-3">
            {indicators.map((indicator) => (
              <div
                key={indicator.id}
                className="grid gap-3 rounded-ds-md border border-ds-border-subtle bg-ds-surface-2 p-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end"
              >
                <div className="space-y-1.5">
                  <Label htmlFor={`indicator-label-${indicator.id}`}>Etiqueta</Label>
                  <Input
                    id={`indicator-label-${indicator.id}`}
                    value={indicator.label}
                    onChange={(event) =>
                      updateIndicator(indicator.id, { label: event.target.value })
                    }
                    className="h-10 sm:h-9"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor={`indicator-value-${indicator.id}`}>Valor publicable</Label>
                  <Input
                    id={`indicator-value-${indicator.id}`}
                    value={indicator.value}
                    onChange={(event) =>
                      updateIndicator(indicator.id, { value: event.target.value })
                    }
                    className="h-10 sm:h-9"
                    placeholder="Ej: 12 años"
                  />
                </div>
                <label className="flex min-h-11 items-center justify-between gap-3 sm:justify-end">
                  <span className="text-[13px] font-medium text-ds-text-2">Visible</span>
                  <Switch
                    size="lg"
                    checked={indicator.visible}
                    onCheckedChange={(visible) =>
                      updateIndicator(indicator.id, { visible })
                    }
                    aria-label={`Mostrar ${indicator.label}`}
                  />
                </label>
              </div>
            ))}

            <div className="flex justify-end pt-1">
              <Button
                type="button"
                className="h-10 gap-2 sm:h-9"
                disabled={
                  savingIndicators ||
                  indicators.some((indicator) => !indicator.label.trim())
                }
                onClick={saveIndicators}
              >
                {savingIndicators ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                Guardar indicadores
              </Button>
            </div>
          </div>
        </Surface>
      </section>
    </div>
  );
}
