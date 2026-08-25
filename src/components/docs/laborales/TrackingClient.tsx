"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Stamp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState, PageHero, Spinner, Stat, StatGrid } from "@/components/opai-ds";
import { readCampaignKpis, sumCampaignKpis } from "@/lib/docs/laborales/tracking-progress";
import { TrackingItemsTable, type TrackingItem } from "./TrackingItemsTable";

type Campaign = { id: string; name: string; totals: unknown };

export function TrackingClient() {
  const search = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [installations, setInstallations] = useState<Array<{ id: string; name: string }>>([]);
  const [items, setItems] = useState<TrackingItem[]>([]);
  const [campaignId, setCampaignId] = useState(search.get("campaignId") ?? "");
  const [status, setStatus] = useState("");
  const [installationId, setInstallationId] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      if (campaignId) qs.set("campaignId", campaignId);
      if (status) qs.set("status", status);
      if (installationId) qs.set("installationId", installationId);
      const res = await fetch(`/api/docs/laborales/tracking?${qs}`);
      const data = await res.json();
      if (!data.success) {
        toast.error(data.error ?? "No se pudo cargar");
        return;
      }
      setCampaigns(data.data.campaigns);
      setInstallations(data.data.installations);
      setItems(data.data.items);
    } finally {
      setLoading(false);
    }
  }, [campaignId, status, installationId]);

  useEffect(() => { void load(); }, [load]);

  const kpis = useMemo(() => {
    const selected = campaigns.find((c) => c.id === campaignId);
    return selected ? readCampaignKpis(selected.totals) : sumCampaignKpis(campaigns);
  }, [campaigns, campaignId]);

  async function remind(payload: { recipientId?: string; campaignId?: string }) {
    const res = await fetch("/api/docs/laborales/tracking/remind", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) {
      toast.error(data.error ?? "No se pudo recordar");
      return;
    }
    toast.success(`Recordatorios enviados: ${data.data.sent}`);
  }

  if (loading && items.length === 0) return <Spinner />;

  return (
    <div className="ds-page-enter space-y-6">
      <PageHero
        icon={Stamp}
        iconTone="rose"
        title="Seguimiento de firmas"
        subtitle="campañas laborales"
        actions={
          <Button className="min-h-11 sm:min-h-9" variant="outline" onClick={() => campaignId ? void remind({ campaignId }) : toast.message("Selecciona una campaña")}>
            Recordatorio a pendientes
          </Button>
        }
      />
      <StatGrid>
        <Stat label="Enviados" value={kpis.sent} animate />
        <Stat label="Pendientes" value={kpis.pending} animate />
        <Stat label="Sin contacto" value={kpis.skipped} animate />
        <Stat label="Errores" value={kpis.error} animate />
      </StatGrid>
      <div className="flex flex-wrap gap-2">
        <select className="h-10 min-h-11 sm:min-h-10 rounded-md border border-ds-border-default bg-ds-surface-1 px-2 text-[13px]" value={campaignId} onChange={(e) => setCampaignId(e.target.value)}>
          <option value="">Todas las campañas</option>
          {campaigns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select className="h-10 min-h-11 sm:min-h-10 rounded-md border border-ds-border-default bg-ds-surface-1 px-2 text-[13px]" value={installationId} onChange={(e) => setInstallationId(e.target.value)}>
          <option value="">Todas las instalaciones</option>
          {installations.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
        </select>
        <select className="h-10 min-h-11 sm:min-h-10 rounded-md border border-ds-border-default bg-ds-surface-1 px-2 text-[13px]" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">Todos los estados</option>
          {["pending", "sent", "skipped", "error", "processing"].map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>
      {items.length === 0 ? (
        <EmptyState icon={Stamp} title="Sin envíos" description="Aún no hay campañas de documentos laborales." />
      ) : (
        <TrackingItemsTable items={items} onRemind={(recipientId) => void remind({ recipientId })} />
      )}
    </div>
  );
}
