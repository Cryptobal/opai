"use client";

import { useCallback, useEffect, useState } from "react";
import { Surface } from "@/components/opai-ds";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { platformJson } from "../platform-fetch";
import { formatUf } from "../format";
import { RoleGuard } from "../RoleGuard";
import { usePlatformUi } from "../PlatformUiProvider";
import { cn } from "@/lib/utils";
import { Tag } from "@/components/opai-ds";

interface CatalogPlan {
  id: string;
  slug: string;
  name: string;
  headline: string | null;
  includedModules: string[];
  active: boolean;
}

interface CatalogAddon {
  id: string;
  slug: string;
  name: string;
  pricingModel: string;
  priceAmount: number;
  moduleKey: string | null;
  isActive?: boolean;
}

export function TenantPlanTab({
  tenantId,
  currentPlan,
  customPricePerGuard,
  customBaseMinimum,
}: {
  tenantId: string;
  currentPlan: string | null;
  customPricePerGuard: number | null;
  customBaseMinimum: number | null;
}) {
  const { can } = usePlatformUi();
  const [plans, setPlans] = useState<CatalogPlan[]>([]);
  const [addons, setAddons] = useState<CatalogAddon[]>([]);
  const [plan, setPlan] = useState(currentPlan ?? "starter");
  const [mode, setMode] = useState<"catalog" | "negotiated">(
    customBaseMinimum != null || customPricePerGuard != null ? "negotiated" : "catalog",
  );
  const [ppg, setPpg] = useState(customPricePerGuard?.toString() ?? "");
  const [min, setMin] = useState(customBaseMinimum?.toString() ?? "");
  const [reason, setReason] = useState("");
  const [enabled, setEnabled] = useState<Record<string, boolean>>({});
  const [initial, setInitial] = useState("");
  const [preview, setPreview] = useState<{
    planPrice: number;
    addonsTotal: number;
    total: number;
    complete: boolean;
  } | null>(null);
  const [saving, setSaving] = useState(false);

  const enterprise = plan === "enterprise";
  const pricingMode = enterprise ? "negotiated" : mode;
  const selected = plans.find((p) => p.slug === plan);
  const includedKey = (selected?.includedModules ?? []).join(",");

  function snap(
    nextPlan: string,
    nextMode: string,
    on: Record<string, boolean>,
    nextPpg: string,
    nextMin: string,
  ) {
    const sorted = Object.fromEntries(Object.keys(on).sort().map((k) => [k, on[k]]));
    return JSON.stringify({ plan: nextPlan, mode: nextMode, on: sorted, ppg: nextPpg, min: nextMin });
  }

  useEffect(() => {
    void (async () => {
      const [p, a] = await Promise.all([
        platformJson<{ plans: CatalogPlan[] }>("/api/platform/catalog/plans"),
        platformJson<{
          availableAddons: CatalogAddon[];
        }>(`/api/platform/tenants/${tenantId}/addons`),
      ]);
      setPlans(p.plans.filter((x) => x.active || x.slug === currentPlan));
      setAddons(a.availableAddons);
      const on: Record<string, boolean> = {};
      for (const ad of a.availableAddons) on[ad.slug] = Boolean(ad.isActive);
      setEnabled(on);
      const nextPlan = currentPlan ?? "starter";
      const nextMode =
        nextPlan === "enterprise" || customBaseMinimum != null || customPricePerGuard != null
          ? "negotiated"
          : "catalog";
      setInitial(
        snap(
          nextPlan,
          nextMode,
          on,
          customPricePerGuard?.toString() ?? "",
          customBaseMinimum?.toString() ?? "",
        ),
      );
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId, currentPlan]);

  const addonPayload = addons
    .filter((ad) => !ad.moduleKey || !(selected?.includedModules ?? []).includes(ad.moduleKey))
    .map((ad) => ({ slug: ad.slug, enabled: Boolean(enabled[ad.slug]) }));

  const snapshot = snap(plan, pricingMode, enabled, ppg, min);
  const dirty = snapshot !== initial && initial !== "";

  const loadPreview = useCallback(async () => {
    const json = await platformJson<{
      pricing: { planPrice: number; addonsTotal: number; total: number; complete: boolean };
    }>(`/api/platform/tenants/${tenantId}/pricing/preview`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        plan,
        pricingMode,
        customPricePerGuard: pricingMode === "negotiated" && ppg ? Number(ppg) : null,
        customBaseMinimum: pricingMode === "negotiated" && min ? Number(min) : null,
        addons: addonPayload,
      }),
    });
    setPreview(json.pricing);
  }, [tenantId, plan, pricingMode, ppg, min, includedKey, enabled]);

  useEffect(() => {
    const t = setTimeout(() => void loadPreview().catch(() => undefined), 250);
    return () => clearTimeout(t);
  }, [loadPreview]);

  const save = async () => {
    setSaving(true);
    try {
      await platformJson(`/api/platform/tenants/${tenantId}/commercial`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plan,
          pricingMode,
          customPricePerGuard: pricingMode === "negotiated" && ppg ? Number(ppg) : null,
          customBaseMinimum: pricingMode === "negotiated" && min ? Number(min) : null,
          reason: pricingMode === "negotiated" ? reason : undefined,
          addons: addonPayload,
        }),
      });
      toast.success("Cambios comerciales guardados");
      setInitial(snapshot);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo guardar");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="grid gap-4 lg:grid-cols-12">
      <div className="space-y-4 lg:col-span-8">
        <div className="grid gap-3 sm:grid-cols-3">
          {plans.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => can("admin") && p.active && setPlan(p.slug)}
              className={cn(
                "rounded-xl border p-4 text-left min-h-11",
                plan === p.slug ? "border-primary bg-ds-surface-2" : "border-ds-border-subtle bg-ds-surface-1",
                !p.active && "opacity-60",
              )}
            >
              <p className="font-display text-[15px]">{p.name}</p>
              {!p.active ? <Tag size="sm" variant="neutral">Plan inactivo ({p.slug})</Tag> : null}
              <p className="mt-1 text-[13px] text-ds-text-3">{p.headline}</p>
            </button>
          ))}
        </div>
        <Surface padding="md">
          <h3 className="font-display text-[15px]">Precio de este tenant</h3>
          <div className="mt-3 flex gap-2">
            <Button type="button" variant={pricingMode === "catalog" ? "primary" : "secondary"} disabled={enterprise} className="h-10 sm:h-9" onClick={() => setMode("catalog")}>Usar catálogo</Button>
            <Button type="button" variant={pricingMode === "negotiated" ? "primary" : "secondary"} className="h-10 sm:h-9" onClick={() => setMode("negotiated")}>Negociado</Button>
          </div>
          {pricingMode === "negotiated" ? (
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div><Label>UF / guardia</Label><Input className="mt-1 h-10 sm:h-9 font-mono" value={ppg} onChange={(e) => setPpg(e.target.value)} /></div>
              <div><Label>Mínimo UF</Label><Input className="mt-1 h-10 sm:h-9 font-mono" value={min} onChange={(e) => setMin(e.target.value)} /></div>
              <div className="sm:col-span-2"><Label>Motivo</Label><Input className="mt-1 h-10 sm:h-9" value={reason} onChange={(e) => setReason(e.target.value)} /></div>
            </div>
          ) : null}
        </Surface>
        <Surface padding="md">
          <h3 className="font-display text-[15px]">Add-ons</h3>
          <ul className="mt-3 space-y-2">
            {addons.filter((ad) => !ad.moduleKey || !(selected?.includedModules ?? []).includes(ad.moduleKey)).map((ad) => (
              <li key={ad.id} className="flex min-h-11 items-center justify-between gap-3">
                <div>
                  <p className="text-[13px]">{ad.name}</p>
                  <p className="font-mono text-[12px] text-ds-text-3">{ad.pricingModel} · {formatUf(ad.priceAmount)}</p>
                </div>
                <Switch checked={Boolean(enabled[ad.slug])} disabled={!can("admin")} onCheckedChange={(v) => setEnabled((s) => ({ ...s, [ad.slug]: v }))} />
              </li>
            ))}
          </ul>
        </Surface>
      </div>
      <Surface padding="md" className="h-fit lg:sticky lg:top-4 lg:col-span-4">
        <h3 className="font-display text-[15px]">Resumen mensual</h3>
        {preview ? (
          <dl className="mt-3 space-y-2 font-mono text-[13px]">
            <div className="flex justify-between"><dt className="text-ds-text-3">Plan</dt><dd>{formatUf(preview.planPrice)}</dd></div>
            <div className="flex justify-between"><dt className="text-ds-text-3">Add-ons</dt><dd>{formatUf(preview.addonsTotal)}</dd></div>
            <div className="flex justify-between"><dt>Total</dt><dd>{formatUf(preview.total)}</dd></div>
            {!preview.complete ? <p className="text-status-warn-fg">Precio pendiente</p> : null}
          </dl>
        ) : <p className="mt-2 text-[13px] text-ds-text-3">Calculando…</p>}
        <RoleGuard minRole="admin">
          <Button type="button" variant="primary" className="mt-4 w-full h-10 sm:h-9" disabled={!can("admin") || !dirty || saving || (pricingMode === "negotiated" && !reason.trim())} onClick={() => void save()}>
            {saving ? "Guardando…" : "Guardar cambios"}
          </Button>
        </RoleGuard>
      </Surface>
    </div>
  );
}
