"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Surface, Spinner, Tag } from "@/components/opai-ds";
import { toast } from "sonner";
import type { ProposalIndicator } from "@/lib/cpq/fixed-sections";

type FixedSection = {
  id: string;
  key: string;
  title: string;
  content: string;
  sortOrder: number;
  active: boolean;
};

export function CpqFixedSectionsConfig() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [sections, setSections] = useState<FixedSection[]>([]);
  const [indicators, setIndicators] = useState<ProposalIndicator[]>([]);
  const [editKey, setEditKey] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editContent, setEditContent] = useState("");
  const [editActive, setEditActive] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/cpq/fixed-sections", { cache: "no-store" });
      const json = await res.json();
      if (json.success) {
        setSections(json.data.sections ?? []);
        setIndicators(json.data.indicators ?? []);
      }
    } catch {
      toast.error("Error al cargar biblioteca fija");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function saveSection() {
    if (!editKey) return;
    setSaving(true);
    try {
      const res = await fetch("/api/cpq/fixed-sections", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "save_section",
          key: editKey,
          title: editTitle,
          content: editContent,
          active: editActive,
        }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      toast.success("Sección fija guardada");
      setEditKey(null);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo guardar");
    } finally {
      setSaving(false);
    }
  }

  async function saveIndicators() {
    setSaving(true);
    try {
      const res = await fetch("/api/cpq/fixed-sections", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "save_indicators", indicators }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      toast.success("Indicadores guardados");
      setIndicators(json.data.indicators ?? indicators);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo guardar");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-[13px] text-ds-text-3">
        <Spinner size="sm" /> Cargando biblioteca…
      </div>
    );
  }

  return (
    <div className="space-y-6 ds-page-enter">
      <Surface elevation={1} padding="md" className="space-y-3">
        <div>
          <h3 className="font-display text-[15px] font-semibold text-ds-text-1">
            Secciones fijas institucionales
          </h3>
          <p className="mt-1 text-[13px] text-ds-text-3">
            Textos base que se copian a cada propuesta. Editá, reordená o desactivá sin inventar datos de tamaño.
          </p>
        </div>
        <ul className="space-y-2">
          {sections.map((s) => (
            <li
              key={s.id}
              className="flex flex-col gap-2 rounded-xl border border-ds-border-subtle bg-ds-surface-2 px-3 py-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-[13px] font-medium text-ds-text-1">{s.title}</span>
                  <Tag variant={s.active ? "ok" : "neutral"} size="sm">
                    {s.active ? "Activa" : "Inactiva"}
                  </Tag>
                  <span className="font-mono text-[12px] text-ds-text-4">{s.key}</span>
                </div>
              </div>
              <Button
                type="button"
                variant="outline"
                className="h-10 sm:h-9"
                onClick={() => {
                  setEditKey(s.key);
                  setEditTitle(s.title);
                  setEditContent(s.content);
                  setEditActive(s.active);
                }}
              >
                Editar
              </Button>
            </li>
          ))}
        </ul>

        {editKey ? (
          <div className="space-y-3 rounded-xl border border-ds-border-default bg-ds-surface-1 p-3">
            <p className="text-[12px] text-ds-text-3">Editando <span className="font-mono">{editKey}</span></p>
            <Input
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              className="h-10 sm:h-9"
              placeholder="Título"
            />
            <Textarea
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              rows={10}
              className="min-h-[160px] text-[13px]"
            />
            <label className="flex min-h-11 items-center gap-2 text-[13px] text-ds-text-2">
              <input
                type="checkbox"
                checked={editActive}
                onChange={(e) => setEditActive(e.target.checked)}
                className="h-4 w-4"
              />
              Activa en nuevas propuestas
            </label>
            <div className="flex gap-2">
              <Button type="button" className="h-10 sm:h-9" disabled={saving} onClick={() => void saveSection()}>
                Guardar sección
              </Button>
              <Button type="button" variant="outline" className="h-10 sm:h-9" onClick={() => setEditKey(null)}>
                Cancelar
              </Button>
            </div>
          </div>
        ) : null}
      </Surface>

      <Surface elevation={1} padding="md" className="space-y-3">
        <div>
          <h3 className="font-display text-[15px] font-semibold text-ds-text-1">
            Indicadores publicables
          </h3>
          <p className="mt-1 text-[13px] text-ds-text-3">
            Solo se imprimen en el PDF si están visibles y con valor. Los de tamaño quedan apagados por defecto.
          </p>
        </div>
        <div className="space-y-2">
          {indicators.map((ind, idx) => (
            <div
              key={ind.id}
              className="grid gap-2 rounded-xl border border-ds-border-subtle bg-ds-surface-2 p-3 sm:grid-cols-[1fr_1fr_auto]"
            >
              <Input
                value={ind.label}
                onChange={(e) => {
                  const next = [...indicators];
                  next[idx] = { ...ind, label: e.target.value };
                  setIndicators(next);
                }}
                className="h-10 sm:h-9"
                placeholder="Etiqueta"
              />
              <Input
                value={ind.value}
                onChange={(e) => {
                  const next = [...indicators];
                  next[idx] = { ...ind, value: e.target.value };
                  setIndicators(next);
                }}
                className="h-10 sm:h-9"
                placeholder="Valor"
              />
              <label className="flex min-h-11 items-center gap-2 text-[13px] text-ds-text-2">
                <input
                  type="checkbox"
                  checked={ind.visible}
                  onChange={(e) => {
                    const next = [...indicators];
                    next[idx] = { ...ind, visible: e.target.checked };
                    setIndicators(next);
                  }}
                  className="h-4 w-4"
                />
                Visible
              </label>
            </div>
          ))}
        </div>
        <Button type="button" className="h-10 sm:h-9" disabled={saving} onClick={() => void saveIndicators()}>
          Guardar indicadores
        </Button>
      </Surface>
    </div>
  );
}
