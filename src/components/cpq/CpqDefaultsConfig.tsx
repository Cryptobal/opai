"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { formatNumber, parseLocalizedNumber } from "@/lib/utils";

interface Template {
  id: string;
  name: string;
  slug: string;
}

const MARGIN_MODES = [
  { value: "sobre_venta", label: "Sobre venta", desc: "Margen como porcentaje del precio de venta" },
  { value: "markup", label: "Markup", desc: "Margen como porcentaje sobre el costo" },
  { value: "solo_mano_obra", label: "Solo mano de obra", desc: "Margen aplicado solo a costos laborales" },
];

export function CpqDefaultsConfig() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [form, setForm] = useState({
    defaultMarginPct: 13,
    defaultMarginMode: "sobre_venta",
    defaultProposalTemplateId: "",
  });

  useEffect(() => {
    Promise.all([
      fetch("/api/cpq/settings", { cache: "no-store" }).then((r) => r.json()),
      fetch("/api/cpq/proposal-templates", { cache: "no-store" }).then((r) => r.json()),
    ]).then(([settingsData, templatesData]) => {
      if (settingsData?.success && settingsData.data) {
        setForm((prev) => ({
          ...prev,
          defaultMarginPct: settingsData.data.defaultMarginPct ?? 13,
          defaultMarginMode: settingsData.data.defaultMarginMode ?? "sobre_venta",
          defaultProposalTemplateId: settingsData.data.defaultProposalTemplateId ?? "",
        }));
      }
      if (templatesData?.success) {
        setTemplates(templatesData.data ?? []);
      }
    }).catch(() => {
      toast.error("Error al cargar configuración");
    }).finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/cpq/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!data?.success) throw new Error(data?.error || "Error");
      toast.success("Valores por defecto guardados");
    } catch {
      toast.error("No se pudieron guardar los valores");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground py-8 justify-center">
        <Loader2 className="h-4 w-4 animate-spin" />
        Cargando configuración...
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-sm font-semibold">Valores por Defecto</h2>
        <p className="text-xs text-muted-foreground">
          Configura los valores predeterminados que se aplican al crear nuevas cotizaciones.
        </p>
      </div>

      <Card className="p-3 sm:p-4 space-y-4 border-border/40 bg-card/50">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground">Margen por defecto (%)</label>
            <Input
              inputMode="decimal"
              value={formatNumber(form.defaultMarginPct, { minDecimals: 1, maxDecimals: 1 })}
              onChange={(e) =>
                setForm((p) => ({ ...p, defaultMarginPct: parseLocalizedNumber(e.target.value) }))
              }
              onFocus={(e) => e.currentTarget.select()}
              className="h-9 text-sm"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground">Modo de margen default</label>
            <select
              className="flex h-9 w-full rounded-md border border-border bg-card px-3 text-sm"
              value={form.defaultMarginMode}
              onChange={(e) => setForm((p) => ({ ...p, defaultMarginMode: e.target.value }))}
            >
              {MARGIN_MODES.map((m) => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
            <p className="text-[10px] text-muted-foreground">
              {MARGIN_MODES.find((m) => m.value === form.defaultMarginMode)?.desc}
            </p>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground">Template de propuesta default</label>
            <select
              className="flex h-9 w-full rounded-md border border-border bg-card px-3 text-sm"
              value={form.defaultProposalTemplateId}
              onChange={(e) => setForm((p) => ({ ...p, defaultProposalTemplateId: e.target.value }))}
            >
              <option value="">Sin template default</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex justify-end">
          <Button size="sm" onClick={handleSave} disabled={saving}>
            {saving ? "Guardando..." : "Guardar valores por defecto"}
          </Button>
        </div>
      </Card>
    </div>
  );
}
