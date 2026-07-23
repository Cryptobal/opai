"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CalendarDays, ChevronDown, ChevronRight, Radar, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Surface, Spinner, EmptyState, Tag } from "@/components/opai-ds";
import { Button } from "@/components/ui/button";
import { CorreoDrawer } from "@/components/crm/correos/CorreoDrawer";
import { RadarComercialRow } from "./RadarComercialRow";
import { kindLabel, type RadarItemDTO } from "./radar-hub-item";

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

/** Resumen contraído: "2 Posible lead · 1 Compromiso" — comunica cantidad y
 *  tipo de novedades sin expandir la tarjeta. Exportado para tests. */
export function radarCollapsedSummary(items: RadarItemDTO[]): string | null {
  if (items.length === 0) return null;
  const byKind = new Map<string, number>();
  for (const item of items) {
    byKind.set(item.kind, (byKind.get(item.kind) ?? 0) + 1);
  }
  return Array.from(byKind.entries())
    .map(([kind, count]) => `${count} ${kindLabel(kind)}`)
    .join(" · ");
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
  // Contraído por defecto: al entrar al hub el radar no roba pantalla; el
  // badge del header muestra cuántas novedades hay pendientes.
  const [expanded, setExpanded] = useState(false);
  // Hilo abierto en el lector: permite leer el correo real (solo lectura)
  // antes de aprobar/descartar la novedad, sin salir del hub.
  const [readerThreadId, setReaderThreadId] = useState<string | null>(null);

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

  const ChevronIcon = expanded ? ChevronDown : ChevronRight;

  const collapsedSummary = !expanded && !loading ? radarCollapsedSummary(items) : null;

  return (
    <Surface elevation={1} padding="md" className="min-w-0 space-y-3">
      {/* Móvil: header compacto con UNA acción primaria visible ("Revisar").
          Las secundarias (Buscar novedades / Mi semana / Ver correos) viven en
          el detalle expandido en móvil y en el header desde sm. */}
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="flex min-w-0 items-center gap-2 ds-tap"
          aria-expanded={expanded}
        >
          <ChevronIcon className="h-4 w-4 shrink-0 text-ds-text-4" />
          <Radar className="h-4 w-4 shrink-0 text-tint-violet-fg" />
          <p className="truncate font-display text-sm font-semibold text-ds-text-1">Radar Comercial</p>
          {total > 0 && <Tag variant="brand" size="sm">{total}</Tag>}
        </button>
        <Button
          size="sm"
          className="shrink-0 sm:hidden"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
        >
          {expanded ? "Cerrar" : "Revisar"}
        </Button>
        <div className="hidden flex-wrap items-center gap-2 sm:flex">
          <Button variant="outline" size="sm" onClick={() => void scan()} disabled={scanning}>
            <RefreshCw className={`h-4 w-4 ${scanning ? "animate-spin" : ""}`} />
            <span className="ml-1.5">{scanning ? "Buscando…" : "Buscar novedades"}</span>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href="/crm/mi-semana">
              <CalendarDays className="h-4 w-4" />
              <span className="ml-1.5">Mi semana</span>
            </Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href="/crm/correos">Ver correos</Link>
          </Button>
        </div>
      </div>

      {/* Contraído: cantidad y tipo de novedades pendientes, sin expandir. */}
      {collapsedSummary && (
        <p className="min-w-0 truncate text-[12px] text-ds-text-4">{collapsedSummary}</p>
      )}

      {expanded && (
        <div className="flex flex-wrap items-center gap-2 sm:hidden">
          <Button variant="outline" size="sm" onClick={() => void scan()} disabled={scanning}>
            <RefreshCw className={`h-4 w-4 ${scanning ? "animate-spin" : ""}`} />
            <span className="ml-1.5">{scanning ? "Buscando…" : "Buscar novedades"}</span>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href="/crm/mi-semana">
              <CalendarDays className="h-4 w-4" />
              <span className="ml-1.5">Mi semana</span>
            </Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href="/crm/correos">Ver correos</Link>
          </Button>
        </div>
      )}

      {expanded &&
        (loading ? (
          <Spinner className="mx-auto" />
        ) : items.length === 0 ? (
          <div className="space-y-3">
            <EmptyState
              icon={Radar}
              title="Radar sin novedades"
              description="Te aviso cuando detecte un lead o compromiso."
              compact
            />
            <div className="flex justify-center">
              <Button variant="outline" size="sm" onClick={() => void scan()} disabled={scanning}>
                <RefreshCw className={`h-4 w-4 ${scanning ? "animate-spin" : ""}`} />
                <span className="ml-1.5">{scanning ? "Buscando…" : "Buscar novedades"}</span>
              </Button>
            </div>
            {lastRun && <p className="text-center text-[12px] text-ds-text-4">{lastRun}</p>}
          </div>
        ) : (
          <ul className="space-y-1.5">
            {items.map((i) => (
              <RadarComercialRow
                key={i.id}
                item={i}
                busy={busy === i.id}
                onResolve={resolve}
                onOpenThread={setReaderThreadId}
              />
            ))}
          </ul>
        ))}

      {/* Lector solo-lectura del correo asociado a la novedad. */}
      <CorreoDrawer
        threadId={readerThreadId}
        canModify={false}
        onClose={() => setReaderThreadId(null)}
      />
    </Surface>
  );
}
