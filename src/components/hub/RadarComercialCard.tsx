"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Radar, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Surface, Spinner, EmptyState, Tag } from "@/components/opai-ds";
import { Button } from "@/components/ui/button";
import { RadarComercialRow } from "./RadarComercialRow";
import type { RadarItemDTO } from "./radar-hub-item";

type RadarMeta = { lastRunAt: string | null; lastClassified: number };

function fmtLastRun(meta: RadarMeta | null): string | null {
  if (!meta?.lastRunAt) return null;
  const hhmm = new Date(meta.lastRunAt).toLocaleTimeString("es-CL", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Santiago",
  });
  return `Última revisión ${hhmm} · ${meta.lastClassified} hilos analizados`;
}

/**
 * Card "Radar Comercial" del hub: leads detectados, señales de compra,
 * compromisos por vencer y briefs pre-reunión. Se auto-oculta si el radar está
 * apagado para el tenant. Gated por `hasCrm` en el wrapper.
 */
export function RadarComercialCard() {
  const [enabled, setEnabled] = useState(true);
  const [items, setItems] = useState<RadarItemDTO[]>([]);
  const [total, setTotal] = useState(0);
  const [meta, setMeta] = useState<RadarMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  async function load() {
    try {
      const r = await fetch("/api/crm/radar").then((x) => x.json());
      setEnabled(r.enabled !== false);
      setItems(r.items ?? []);
      setTotal(r.total ?? 0);
      setMeta(r.meta ?? null);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function scan() {
    setScanning(true);
    try {
      const r = await fetch("/api/crm/radar/scan", { method: "POST" }).then((x) => x.json());
      const classified = Number(r.classified) || 0;
      const created = Number(r.created) || 0;
      toast.success(`${classified} hilos analizados · ${created} novedades`);
      await load();
    } catch {
      toast.error("No se pudo buscar novedades");
    } finally {
      setScanning(false);
    }
  }

  async function resolve(id: string, status: "DONE" | "DISMISSED") {
    setBusy(id);
    setItems((prev) => prev.filter((i) => i.id !== id));
    setTotal((t) => Math.max(0, t - 1));
    try {
      await fetch(`/api/crm/radar/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
    } catch {
      void load();
    } finally {
      setBusy(null);
    }
  }

  if (!enabled) return null;

  const lastRun = fmtLastRun(meta);

  return (
    <Surface elevation={1} padding="md" className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Radar className="h-4 w-4 text-tint-violet-fg" />
          <p className="font-display text-sm font-semibold text-ds-text-1">Radar Comercial</p>
          {total > 0 && <Tag variant="brand" size="sm">{total}</Tag>}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => void scan()} disabled={scanning}>
            <RefreshCw className={`h-4 w-4 ${scanning ? "animate-spin" : ""}`} />
            <span className="ml-1.5">{scanning ? "Buscando…" : "Buscar novedades"}</span>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href="/crm/correos">Ver correos</Link>
          </Button>
        </div>
      </div>

      {loading ? (
        <Spinner className="mx-auto" />
      ) : items.length === 0 ? (
        <div className="space-y-2">
          <EmptyState
            icon={Radar}
            title="Radar sin novedades"
            description="Te aviso cuando detecte un lead o compromiso."
            compact
          />
          {lastRun && <p className="text-center text-[12px] text-ds-text-4">{lastRun}</p>}
        </div>
      ) : (
        <ul className="space-y-1.5">
          {items.map((i) => (
            <RadarComercialRow key={i.id} item={i} busy={busy === i.id} onResolve={resolve} />
          ))}
        </ul>
      )}
    </Surface>
  );
}
