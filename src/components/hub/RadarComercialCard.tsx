"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Radar } from "lucide-react";
import { Surface, Spinner, EmptyState, Tag } from "@/components/opai-ds";
import { Button } from "@/components/ui/button";
import { RadarComercialRow } from "./RadarComercialRow";
import type { RadarItemDTO } from "./radar-hub-item";

/**
 * Card "Radar Comercial" del hub: leads detectados, señales de compra,
 * compromisos por vencer y briefs pre-reunión. Se auto-oculta si el radar está
 * apagado para el tenant. Gated por `hasCrm` en el wrapper.
 */
export function RadarComercialCard() {
  const [enabled, setEnabled] = useState(true);
  const [items, setItems] = useState<RadarItemDTO[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  async function load() {
    try {
      const r = await fetch("/api/crm/radar").then((x) => x.json());
      setEnabled(r.enabled !== false);
      setItems(r.items ?? []);
      setTotal(r.total ?? 0);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

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

  return (
    <Surface elevation={1} padding="md" className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Radar className="h-4 w-4 text-tint-violet-fg" />
          <p className="font-display text-sm font-semibold text-ds-text-1">Radar Comercial</p>
          {total > 0 && <Tag variant="brand" size="sm">{total}</Tag>}
        </div>
        <Button asChild variant="outline" size="sm">
          <Link href="/crm/correos">Ver correos</Link>
        </Button>
      </div>

      {loading ? (
        <Spinner className="mx-auto" />
      ) : items.length === 0 ? (
        <EmptyState
          icon={Radar}
          title="Radar sin novedades"
          description="Te aviso cuando detecte un lead o compromiso."
          compact
        />
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
