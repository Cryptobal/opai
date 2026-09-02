"use client";

import { useEffect, useMemo, useState } from "react";
import { Surface, Tag } from "@/components/opai-ds";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { toast } from "sonner";
import { platformJson } from "../platform-fetch";
import {
  MODULE_REGISTRY,
  MODULE_CATEGORIES,
  MODULE_CATEGORY_LABELS,
  moduleIsBeta,
} from "@/lib/modules/registry";
import { isBetaBlockedForPlan } from "@/lib/platform/module-origin";

interface Plan {
  id: string;
  slug: string;
  name: string;
  headline: string | null;
  pricePerGuard: number;
  baseMinimum: number;
  maxGuards: number;
  maxAdmins: number;
  trialDays: number;
  featured: boolean;
  includedModules: string[];
  active: boolean;
}

export function CatalogPlansTab() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [draft, setDraft] = useState<Record<string, Plan>>({});
  const [confirm, setConfirm] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void platformJson<{ plans: Plan[] }>("/api/platform/catalog/plans").then((j) => {
      const active = j.plans.filter((p) => p.active);
      setPlans(active);
      setDraft(Object.fromEntries(active.map((p) => [p.id, { ...p, includedModules: [...p.includedModules] }])));
    });
  }, []);

  const dirty = useMemo(
    () => plans.some((p) => JSON.stringify(p) !== JSON.stringify(draft[p.id])),
    [plans, draft],
  );

  const patch = (id: string, over: Partial<Plan>) => {
    setDraft((d) => ({ ...d, [id]: { ...d[id], ...over } }));
  };

  const toggleMod = (plan: Plan, key: string) => {
    if (plan.slug === "enterprise") return;
    if (isBetaBlockedForPlan(key, plan.slug)) return;
    const cur = draft[plan.id]?.includedModules ?? [];
    const next = cur.includes(key) ? cur.filter((k) => k !== key) : [...cur, key];
    patch(plan.id, { includedModules: next });
  };

  const save = async () => {
    setSaving(true);
    try {
      for (const p of plans) {
        const d = draft[p.id];
        if (!d || JSON.stringify(p) === JSON.stringify(d)) continue;
        await platformJson(`/api/platform/catalog/plans/${p.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(d),
        });
      }
      toast.success("Catálogo actualizado");
      setPlans(plans.map((p) => draft[p.id] ?? p));
      setConfirm(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo guardar");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-3 lg:grid-cols-3">
        {plans.map((p) => {
          const d = draft[p.id] ?? p;
          const enterprise = p.slug === "enterprise";
          return (
            <Surface key={p.id} padding="md">
              <Input className="h-10 sm:h-9 font-display" value={d.name} onChange={(e) => patch(p.id, { name: e.target.value })} />
              <Input className="mt-2 h-10 sm:h-9" value={d.headline ?? ""} onChange={(e) => patch(p.id, { headline: e.target.value })} />
              <div className="mt-3 grid grid-cols-2 gap-2">
                <div>
                  <Label>UF/guardia</Label>
                  <Input className="h-10 sm:h-9 font-mono" disabled={enterprise} placeholder={enterprise ? "negociado" : undefined} value={enterprise ? "" : String(d.pricePerGuard)} onChange={(e) => patch(p.id, { pricePerGuard: Number(e.target.value) })} />
                </div>
                <div>
                  <Label>Mínimo</Label>
                  <Input className="h-10 sm:h-9 font-mono" disabled={enterprise} placeholder={enterprise ? "—" : undefined} value={enterprise ? "" : String(d.baseMinimum)} onChange={(e) => patch(p.id, { baseMinimum: Number(e.target.value) })} />
                </div>
                <div>
                  <Label>Máx guardias</Label>
                  <Input className="h-10 sm:h-9 font-mono" placeholder={enterprise ? "sin tope" : undefined} value={d.maxGuards === 0 ? "" : String(d.maxGuards)} onChange={(e) => patch(p.id, { maxGuards: e.target.value === "" ? 0 : Number(e.target.value) })} />
                </div>
                <div>
                  <Label>Máx admins</Label>
                  <Input className="h-10 sm:h-9 font-mono" value={String(d.maxAdmins)} onChange={(e) => patch(p.id, { maxAdmins: Number(e.target.value) })} />
                </div>
                <div>
                  <Label>Días trial</Label>
                  <Input className="h-10 sm:h-9 font-mono" value={String(d.trialDays)} onChange={(e) => patch(p.id, { trialDays: Number(e.target.value) })} />
                </div>
                <label className="flex items-center gap-2 pt-6 text-[13px]">
                  <Checkbox checked={d.featured} onCheckedChange={(v) => patch(p.id, { featured: Boolean(v) })} />
                  Destacado
                </label>
              </div>
            </Surface>
          );
        })}
      </div>

      <Surface padding="md" className="overflow-x-auto">
        <h3 className="font-display text-[15px]">Módulos por plan</h3>
        {MODULE_CATEGORIES.map((cat) => {
          const mods = MODULE_REGISTRY.filter((m) => m.category === cat);
          return (
            <div key={cat} className="mt-4">
              <p className="text-[12px] uppercase tracking-wide text-ds-text-3">
                {MODULE_CATEGORY_LABELS[cat]} · {mods.length}
              </p>
              {mods.map((m) => (
                <div key={m.key} className="grid grid-cols-[1fr_repeat(3,2.5rem)] items-center gap-2 border-b border-ds-border-subtle py-2 min-h-11">
                  <span className="text-[13px]">
                    {m.label}
                    {moduleIsBeta(m) ? <Tag size="sm" variant="warn" className="ml-2">Beta</Tag> : null}
                  </span>
                  {plans.map((p) => {
                    const enterprise = p.slug === "enterprise";
                    const blocked = isBetaBlockedForPlan(m.key, p.slug);
                    const checked = enterprise || (draft[p.id]?.includedModules ?? []).includes(m.key);
                    return (
                      <Checkbox
                        key={p.id}
                        checked={checked}
                        disabled={enterprise || blocked}
                        onCheckedChange={() => toggleMod(p, m.key)}
                      />
                    );
                  })}
                </div>
              ))}
            </div>
          );
        })}
      </Surface>

      <Button type="button" variant="primary" className="h-10 sm:h-9" disabled={!dirty} onClick={() => setConfirm(true)}>
        Guardar planes
      </Button>
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title="Guardar catálogo"
        description="Afecta solo a tenants nuevos y a cambios de plan futuros."
        confirmLabel="Guardar"
        variant="default"
        loading={saving}
        onConfirm={() => void save()}
      />
    </div>
  );
}
