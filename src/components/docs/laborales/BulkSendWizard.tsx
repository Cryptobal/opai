"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHero, Spinner, Surface } from "@/components/opai-ds";
import { BulkAudienceStep, type EligibleRow } from "./BulkAudienceStep";
import { BulkConfirmStep } from "./BulkConfirmStep";

type Template = { id: string; name: string };

export function BulkSendWizard() {
  const search = useSearchParams();
  const preInst = search.get("installationId");
  const [step, setStep] = useState(1);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [templateId, setTemplateId] = useState("");
  const [audience, setAudience] = useState<"all_active" | "installations" | "manual">(
    preInst ? "installations" : "all_active",
  );
  const [installationIds, setInstallationIds] = useState<string[]>(preInst ? [preInst] : []);
  const [eligible, setEligible] = useState<EligibleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [progress, setProgress] = useState<{ processed: number; remaining: number } | null>(null);

  useEffect(() => {
    void (async () => {
      const res = await fetch("/api/docs/laborales/templates");
      const data = await res.json();
      if (data.success) setTemplates(data.data.templates.filter((t: { isActive: boolean }) => t.isActive));
      setLoading(false);
    })();
  }, []);

  const selected = useMemo(() => eligible.filter((g) => !g.excluded), [eligible]);

  async function loadEligible() {
    setWorking(true);
    try {
      const res = await fetch("/api/docs/laborales/campaigns?preview=1", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          templateId,
          audience,
          installationIds,
          guardiaIds: audience === "manual" ? eligible.map((g) => g.id) : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "No se pudo listar destinatarios");
        return;
      }
      setEligible((data.data.eligible as EligibleRow[]).map((g) => ({ ...g, excluded: Boolean(g.skipReason) })));
      setStep(2);
    } finally {
      setWorking(false);
    }
  }

  async function confirm() {
    setWorking(true);
    try {
      const res = await fetch("/api/docs/laborales/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          templateId,
          audience: "manual",
          guardiaIds: eligible.filter((g) => !g.excluded || g.skipReason).map((g) => g.id),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "No se pudo crear la campaña");
        return;
      }
      let remaining = Number(data.data.totals.pending ?? 0);
      let processed = 0;
      setProgress({ processed, remaining });
      for (let i = 0; i < 200 && remaining > 0; i++) {
        const proc = await fetch(`/api/docs/laborales/campaigns/${data.data.campaignId}/process`, { method: "POST" });
        const body = await proc.json();
        if (!proc.ok) {
          toast.error(body.error ?? "Error al procesar");
          break;
        }
        processed += body.data.processed;
        remaining = body.data.remaining;
        setProgress({ processed, remaining });
        if (body.data.status === "done") break;
      }
      toast.success("Campaña procesada");
    } finally {
      setWorking(false);
    }
  }

  if (loading) return <Spinner />;

  return (
    <div className="ds-page-enter space-y-6">
      <PageHero icon={Send} iconTone="rose" title="Envío masivo" subtitle="documentos laborales" />
      {step === 1 && (
        <Surface elevation={1} padding="md" className="space-y-3">
          <p className="font-medium">1. Plantilla</p>
          <select className="h-10 w-full rounded-md border border-ds-border-default bg-ds-surface-1 px-2" value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
            <option value="">Selecciona</option>
            {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          <Button className="min-h-11" disabled={!templateId || working} onClick={() => void loadEligible()}>Continuar</Button>
        </Surface>
      )}
      {step === 2 && (
        <BulkAudienceStep
          audience={audience}
          onAudience={setAudience}
          installationIds={installationIds}
          onInstallations={setInstallationIds}
          rows={eligible}
          onRows={setEligible}
          working={working}
          onBack={() => setStep(1)}
          onReload={() => void loadEligible()}
          onNext={() => setStep(3)}
        />
      )}
      {step === 3 && (
        <BulkConfirmStep
          count={selected.filter((g) => !g.skipReason).length}
          skipped={eligible.filter((g) => g.skipReason || g.excluded).length}
          working={working}
          progress={progress}
          onBack={() => setStep(2)}
          onConfirm={() => void confirm()}
        />
      )}
    </div>
  );
}
