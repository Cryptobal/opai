"use client";

import { useEffect, useState } from "react";
import { Surface } from "@/components/opai-ds";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { platformJson } from "../platform-fetch";

interface SettingsMap {
  "lifecycle.enabled": boolean;
  "lifecycle.emailsEnabled": boolean;
  "lifecycle.exemptSlugs": string[];
  "trial.defaultDays": number;
  "trial.graceDays": number;
  "pastDue.graceDays": number;
  "suspended.marcacionGraceDays": number;
  "signup.defaultPlan": string;
}

export function CatalogSettingsTab() {
  const [s, setS] = useState<SettingsMap | null>(null);
  const [chip, setChip] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void platformJson<{ settings: SettingsMap }>("/api/platform/settings").then((j) => setS(j.settings));
  }, []);

  if (!s) return <p className="text-[13px] text-ds-text-3">Cargando…</p>;

  const save = async () => {
    setSaving(true);
    try {
      await platformJson("/api/platform/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(s),
      });
      toast.success("Configuración guardada");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo guardar");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Surface padding="md" className="space-y-4 max-w-xl">
      <div className="flex items-center justify-between">
        <Label>Ciclo de vida activo</Label>
        <Switch checked={s["lifecycle.enabled"]} onCheckedChange={(v) => setS({ ...s, "lifecycle.enabled": v })} />
      </div>
      <div className="flex items-center justify-between">
        <Label>Emails de ciclo de vida</Label>
        <Switch checked={s["lifecycle.emailsEnabled"]} onCheckedChange={(v) => setS({ ...s, "lifecycle.emailsEnabled": v })} />
      </div>
      <div>
        <Label>Slugs exentos</Label>
        <div className="mt-2 flex flex-wrap gap-2">
          {s["lifecycle.exemptSlugs"].map((slug) => (
            <button
              key={slug}
              type="button"
              className="rounded-full bg-ds-surface-2 px-3 py-1 font-mono text-[12px]"
              onClick={() =>
                setS({ ...s, "lifecycle.exemptSlugs": s["lifecycle.exemptSlugs"].filter((x) => x !== slug) })
              }
            >
              {slug} ×
            </button>
          ))}
        </div>
        <form
          className="mt-2 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!chip.trim()) return;
            setS({ ...s, "lifecycle.exemptSlugs": [...s["lifecycle.exemptSlugs"], chip.trim()] });
            setChip("");
          }}
        >
          <Input className="h-10 sm:h-9 font-mono" value={chip} onChange={(e) => setChip(e.target.value)} placeholder="slug" />
          <Button type="submit" variant="secondary" className="h-10 sm:h-9">Añadir</Button>
        </form>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div><Label>Días trial</Label><Input className="h-10 sm:h-9 font-mono" value={s["trial.defaultDays"]} onChange={(e) => setS({ ...s, "trial.defaultDays": Number(e.target.value) })} /></div>
        <div><Label>Gracia trial</Label><Input className="h-10 sm:h-9 font-mono" value={s["trial.graceDays"]} onChange={(e) => setS({ ...s, "trial.graceDays": Number(e.target.value) })} /></div>
        <div><Label>Gracia mora</Label><Input className="h-10 sm:h-9 font-mono" value={s["pastDue.graceDays"]} onChange={(e) => setS({ ...s, "pastDue.graceDays": Number(e.target.value) })} /></div>
        <div><Label>Plan signup</Label><Input className="h-10 sm:h-9 font-mono" value={s["signup.defaultPlan"]} onChange={(e) => setS({ ...s, "signup.defaultPlan": e.target.value })} /></div>
      </div>
      <Button type="button" variant="primary" className="h-10 sm:h-9" disabled={saving} onClick={() => void save()}>
        Guardar
      </Button>
    </Surface>
  );
}
