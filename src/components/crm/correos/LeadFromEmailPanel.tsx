"use client";

import { useEffect, useRef, useState } from "react";
import { Sparkles, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { isGoogleMapsUrl, parseGoogleMapsUrl } from "@/lib/google-maps-url";
import { LeadFields } from "./LeadFields";
import type { LeadExtraction, StagedFile } from "@/modules/crm/email/email-to-lead.types";

const BTN = "h-10 sm:h-9 rounded-lg px-3 text-[13px] font-medium ds-tap disabled:opacity-50";

async function resolveMapsIntoProposal(p: LeadExtraction): Promise<LeadExtraction> {
  if (!p.mapsUrl || !isGoogleMapsUrl(p.mapsUrl)) return p;
  if (p.lat != null && p.lng != null && p.direccion) return p;

  let coords = parseGoogleMapsUrl(p.mapsUrl);
  if (!coords) {
    try {
      const res = await fetch("/api/geocode/reverse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: p.mapsUrl }),
      });
      const data = await res.json();
      if (res.ok && data.lat != null && data.lng != null) {
        coords = { lat: data.lat, lng: data.lng };
      }
    } catch {
      /* ignore — el usuario puede pegar el link manualmente */
    }
  }
  if (!coords) return p;
  return {
    ...p,
    lat: p.lat ?? coords.lat,
    lng: p.lng ?? coords.lng,
  };
}

export function LeadFromEmailPanel({
  threadId,
  hasAccount,
  onClose,
  onCreated,
}: {
  threadId: string;
  hasAccount: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [p, setP] = useState<LeadExtraction | null>(null);
  const [staged, setStaged] = useState<StagedFile[]>([]);
  const [sources, setSources] = useState<string[]>([]);
  const resolvedMapsRef = useRef<string | null>(null);

  useEffect(() => {
    let live = true;
    setLoading(true);
    setError(null);
    resolvedMapsRef.current = null;
    fetch(`/api/crm/correos/${threadId}/extract`, { method: "POST" })
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.error || "No se pudo analizar el correo");
        return j;
      })
      .then(async (j) => {
        if (!live) return;
        let proposal = j.proposal as LeadExtraction;
        if (proposal?.mapsUrl) {
          proposal = await resolveMapsIntoProposal(proposal);
          resolvedMapsRef.current = proposal.mapsUrl;
        }
        if (!live) return;
        setP(proposal);
        setStaged(j.stagedFiles ?? []);
        setSources(j.sources ?? []);
      })
      .catch((e) => live && setError(e.message))
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, [threadId]);

  // Si el usuario cambia el mapsUrl, intentar resolver coords.
  const mapsUrl = p?.mapsUrl ?? null;
  const hasCoords = p?.lat != null && p?.lng != null;
  useEffect(() => {
    if (!mapsUrl || mapsUrl === resolvedMapsRef.current || hasCoords) {
      if (mapsUrl && hasCoords) resolvedMapsRef.current = mapsUrl;
      return;
    }
    let live = true;
    void resolveMapsIntoProposal({
      ...(p as LeadExtraction),
      mapsUrl,
    }).then((next) => {
      if (!live) return;
      resolvedMapsRef.current = next.mapsUrl;
      setP((prev) => (prev ? { ...prev, lat: next.lat, lng: next.lng } : prev));
    });
    return () => {
      live = false;
    };
    // Solo reaccionar a mapsUrl / coords; no a todo el proposal.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapsUrl, hasCoords]);

  async function create(mode: "lead" | "lead_y_negocio") {
    if (!p) return;
    setCreating(true);
    try {
      const r = await fetch(`/api/crm/correos/${threadId}/create-lead`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ proposal: p, mode, stagedFiles: staged }),
      });
      const j = await r.json();
      if (!r.ok || !j.ok) throw new Error(j.error || "No se pudo crear el lead");
      toast.success(j.dealId ? "Lead + negocio de licitación creados" : "Lead listo para cotizar", {
        description: j.note,
        action: j.leadUrl ? { label: "Ver lead", onClick: () => window.open(j.leadUrl, "_blank") } : undefined,
      });
      onCreated();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al crear el lead");
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="space-y-2.5 rounded-xl border border-tint-violet-fg/30 bg-tint-violet p-3">
      <div className="flex items-center gap-2 text-tint-violet-fg">
        <Sparkles className="h-4 w-4" />
        <span className="text-[13px] font-semibold">Extracción IA</span>
      </div>

      {loading ? (
        <p className="flex items-center gap-2 text-[13px] text-tint-violet-fg">
          <Loader2 className="h-4 w-4 animate-spin" /> Analizando el correo y sus adjuntos…
        </p>
      ) : error ? (
        <p className="text-[13px] text-status-danger-fg">{error}</p>
      ) : p ? (
        <>
          <LeadFields p={p} onChange={setP} />
          {sources.length > 0 && (
            <p className="text-[12px] text-tint-violet-fg/80">Fuentes: {sources.join(", ")}</p>
          )}
          <div className="flex flex-wrap gap-2 pt-1">
            <button
              type="button"
              onClick={() => create("lead")}
              disabled={creating}
              className={`${BTN} bg-primary text-primary-foreground`}
            >
              Crear lead listo para cotizar
            </button>
            <button
              type="button"
              onClick={() => create("lead_y_negocio")}
              disabled={creating || !p.esLicitacion || !hasAccount}
              title={!hasAccount ? "Asociá el hilo a una cuenta primero" : undefined}
              className={`${BTN} border border-ds-border-default text-ds-text-1`}
            >
              + Negocio licitación
            </button>
            <button type="button" onClick={onClose} disabled={creating} className={`${BTN} text-ds-text-3`}>
              Descartar
            </button>
          </div>
        </>
      ) : null}
    </div>
  );
}
