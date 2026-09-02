"use client";

import { useEffect, useState } from "react";
import { DataTable } from "@/components/opai-ds";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { toast } from "sonner";
import { platformJson } from "../platform-fetch";
import { MODULE_REGISTRY } from "@/lib/modules/registry";
import { formatUf } from "../format";

interface Addon {
  id: string;
  slug: string;
  name: string;
  pricingModel: string;
  priceAmount: number;
  moduleKey: string | null;
  active: boolean;
  sortOrder: number;
}

export function CatalogAddonsTab() {
  const [addons, setAddons] = useState<Addon[]>([]);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [model, setModel] = useState("flat");
  const [price, setPrice] = useState("0");
  const [moduleKey, setModuleKey] = useState("");

  const load = () =>
    platformJson<{ addons: Addon[] }>("/api/platform/catalog/addons").then((j) => setAddons(j.addons));

  useEffect(() => {
    void load();
  }, []);

  const patch = async (id: string, data: Partial<Addon>) => {
    await platformJson(`/api/platform/catalog/addons/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    await load();
  };

  const create = async () => {
    try {
      await platformJson("/api/platform/catalog/addons", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          slug,
          pricingModel: model,
          priceAmount: Number(price),
          moduleKey: moduleKey || null,
        }),
      });
      setOpen(false);
      setName("");
      setSlug("");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo crear");
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button type="button" variant="primary" className="h-10 sm:h-9" onClick={() => setOpen(true)}>
          Nuevo add-on
        </Button>
      </div>
      <DataTable
        rowKey={(r) => r.id}
        rows={addons}
        columns={[
          { id: "name", header: "Nombre", cell: (r) => r.name },
          {
            id: "mod",
            header: "Módulo",
            cell: (r) => (
              <select
                className="h-10 sm:h-9 rounded-md border border-ds-border-default bg-ds-surface-1 px-2 text-[13px]"
                value={r.moduleKey ?? ""}
                onChange={(e) => void patch(r.id, { moduleKey: e.target.value || null })}
              >
                <option value="">—</option>
                {MODULE_REGISTRY.map((m) => (
                  <option key={m.key} value={m.key}>{m.label}</option>
                ))}
              </select>
            ),
          },
          {
            id: "model",
            header: "Modelo",
            cell: (r) => (
              <select
                className="h-10 sm:h-9 rounded-md border border-ds-border-default bg-ds-surface-1 px-2 text-[13px]"
                value={r.pricingModel === "per_unit" ? "flat" : r.pricingModel}
                onChange={(e) => void patch(r.id, { pricingModel: e.target.value })}
              >
                <option value="per_guard">per_guard</option>
                <option value="flat">flat</option>
              </select>
            ),
          },
          { id: "price", header: "Precio", cell: (r) => <span className="font-mono">{formatUf(r.priceAmount)}</span> },
          {
            id: "active",
            header: "Activo",
            cell: (r) => <Switch checked={r.active} onCheckedChange={(v) => void patch(r.id, { active: v })} />,
          },
        ]}
      />
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent className="bg-ds-surface-1">
          <SheetHeader>
            <SheetTitle className="font-display">Nuevo add-on</SheetTitle>
          </SheetHeader>
          <div className="mt-4 space-y-3">
            <div><Label>Nombre</Label><Input className="h-10 sm:h-9" value={name} onChange={(e) => setName(e.target.value)} /></div>
            <div><Label>Slug</Label><Input className="h-10 sm:h-9 font-mono" value={slug} onChange={(e) => setSlug(e.target.value)} /></div>
            <div>
              <Label>Modelo</Label>
              <select className="mt-1 flex h-10 w-full rounded-md border border-ds-border-default bg-ds-surface-2 px-3 text-[13px]" value={model} onChange={(e) => setModel(e.target.value)}>
                <option value="flat">flat</option>
                <option value="per_guard">per_guard</option>
              </select>
            </div>
            <div><Label>Precio UF</Label><Input className="h-10 sm:h-9 font-mono" value={price} onChange={(e) => setPrice(e.target.value)} /></div>
            <div>
              <Label>Módulo</Label>
              <select className="mt-1 flex h-10 w-full rounded-md border border-ds-border-default bg-ds-surface-2 px-3 text-[13px]" value={moduleKey} onChange={(e) => setModuleKey(e.target.value)}>
                <option value="">—</option>
                {MODULE_REGISTRY.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
              </select>
            </div>
            <Button type="button" variant="primary" className="w-full h-10 sm:h-9" onClick={() => void create()}>Crear</Button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
