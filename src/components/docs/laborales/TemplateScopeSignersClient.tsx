"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Stamp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHero, Spinner, Surface, Tag } from "@/components/opai-ds";
import type { ScopeType } from "@/lib/docs/laborales/constants";
import { TemplateSignersEditor, type TemplateSignerDraft } from "./TemplateSignersEditor";

export function TemplateScopeSignersClient({ templateId }: { templateId: string }) {
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [scopeType, setScopeType] = useState<ScopeType>("none");
  const [signingMode, setSigningMode] = useState<"sequential" | "parallel">("sequential");
  const [isActive, setIsActive] = useState(false);
  const [installationIds, setInstallationIds] = useState<string[]>([]);
  const [installations, setInstallations] = useState<Array<{ id: string; name: string }>>([]);
  const [counts, setCounts] = useState({ installations: 0, guardias: 0 });
  const [signers, setSigners] = useState<TemplateSignerDraft[]>([]);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const [tplRes, listRes] = await Promise.all([
      fetch(`/api/docs/laborales/templates/${templateId}`),
      fetch("/api/docs/laborales/templates"),
    ]);
    const tpl = await tplRes.json();
    const list = await listRes.json();
    if (!tpl.success) {
      toast.error(tpl.error ?? "No encontrada");
      return;
    }
    setName(tpl.data.name);
    setScopeType(tpl.data.scopeType);
    setSigningMode(tpl.data.signingMode);
    setIsActive(tpl.data.isActive);
    setInstallationIds((tpl.data.installations ?? []).map((i: { installationId: string }) => i.installationId));
    setSigners(tpl.data.signers ?? []);
    if (list.success) {
      setInstallations(list.data.installations);
      setCounts(list.data.counts);
    }
    setLoading(false);
  }, [templateId]);

  useEffect(() => { void load(); }, [load]);

  async function save() {
    setSaving(true);
    try {
      const scopeRes = await fetch(`/api/docs/laborales/templates/${templateId}/scope`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scopeType, installationIds, signingMode, isActive }),
      });
      const scopeData = await scopeRes.json();
      if (!scopeRes.ok) {
        toast.error(scopeData.error ?? "No se pudo guardar el alcance");
        return;
      }
      const signRes = await fetch(`/api/docs/laborales/templates/${templateId}/signers`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ signers }),
      });
      const signData = await signRes.json();
      if (!signRes.ok) {
        toast.error(signData.error ?? "No se pudieron guardar los firmantes");
        return;
      }
      toast.success("Plantilla actualizada");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <Spinner />;

  return (
    <div className="ds-page-enter space-y-6">
      <PageHero
        icon={Stamp}
        iconTone="rose"
        title={name}
        subtitle="alcance y firmantes"
        actions={
          <div className="flex gap-2">
            <Button asChild variant="outline" className="min-h-11 sm:min-h-9">
              <Link href={`/opai/documentos/laborales/${templateId}/editar`}>Editar contenido</Link>
            </Button>
            <Button className="min-h-11 sm:min-h-9" disabled={saving} onClick={() => void save()}>Guardar</Button>
          </div>
        }
      />
      <Surface elevation={1} padding="md" className="space-y-3">
        <p className="font-medium">Alcance</p>
        <label className="flex min-h-11 items-center gap-2">
          <input type="radio" checked={scopeType === "global_active"} onChange={() => setScopeType("global_active")} />
          Global (activas, incluye futuras) — {counts.installations} inst. / {counts.guardias} guardias
        </label>
        <label className="flex min-h-11 items-center gap-2">
          <input type="radio" checked={scopeType === "installations"} onChange={() => setScopeType("installations")} />
          Instalaciones específicas
        </label>
        {scopeType === "installations" && (
          <div className="flex flex-wrap gap-2">
            {installations.map((inst) => {
              const on = installationIds.includes(inst.id);
              return (
                <button
                  key={inst.id}
                  type="button"
                  className="min-h-11 rounded-full border border-ds-border-default px-3 text-[13px]"
                  onClick={() => setInstallationIds((ids) => on ? ids.filter((id) => id !== inst.id) : [...ids, inst.id])}
                >
                  <Tag size="sm" variant={on ? "brand" : "neutral"}>{inst.name}</Tag>
                </button>
              );
            })}
          </div>
        )}
        <label className="flex min-h-11 items-center gap-2">
          <input type="checkbox" checked={signingMode === "parallel"} onChange={(e) => setSigningMode(e.target.checked ? "parallel" : "sequential")} />
          Firma en paralelo
        </label>
        <label className="flex min-h-11 items-center gap-2">
          <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
          Plantilla activa
        </label>
      </Surface>
      <TemplateSignersEditor signers={signers} onChange={setSigners} />
    </div>
  );
}
