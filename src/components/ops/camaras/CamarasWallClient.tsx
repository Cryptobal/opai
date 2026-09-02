"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Video } from "lucide-react";
import { EmptyState, PageHero, Spinner } from "@/components/opai-ds";
import { useIsTouchLayout } from "@/hooks/useIsTouchLayout";
import { CamaraTile } from "./CamaraTile";
import { CamaraViewerModal } from "./CamaraViewerModal";
import { CamaraLayoutBar } from "./CamaraLayoutBar";
import { CamaraWallToolbar } from "./CamaraWallToolbar";
import { createLayout, deleteLayout } from "./wall-api";
import type { CamaraDto, LayoutDto, RelayAccess } from "./types";

export function CamarasWallClient() {
  const touch = useIsTouchLayout();
  const [cameras, setCameras] = useState<CamaraDto[]>([]);
  const [layouts, setLayouts] = useState<LayoutDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [accountId, setAccountId] = useState("");
  const [selectedInst, setSelectedInst] = useState<string[]>([]);
  const [gridSize, setGridSize] = useState(4);
  const [layoutId, setLayoutId] = useState<string | null>(null);
  const [cycling, setCycling] = useState(false);
  const [viewer, setViewer] = useState<CamaraDto | null>(null);
  const [relay, setRelay] = useState<RelayAccess | null>(null);

  const load = useCallback(async () => {
    const [cRes, lRes] = await Promise.all([
      fetch("/api/ops/camaras"),
      fetch("/api/ops/camaras/layouts"),
    ]);
    const cJson = await cRes.json().catch(() => ({}));
    const lJson = await lRes.json().catch(() => ({}));
    setCameras(cJson.data ?? []);
    setLayouts(lJson.data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const visible = useMemo(() => {
    const layout = layouts.find((l) => l.id === layoutId);
    let list = cameras;
    if (layout) {
      const order = new Map(layout.cameraIds.map((id, i) => [id, i]));
      list = cameras.filter((c) => order.has(c.id)).sort((a, b) => (order.get(a.id)! - order.get(b.id)!));
    } else {
      if (accountId) list = list.filter((c) => c.installation?.accountId === accountId);
      if (selectedInst.length) list = list.filter((c) => selectedInst.includes(c.installationId));
    }
    return list.slice(0, touch ? 1 : gridSize);
  }, [cameras, layouts, layoutId, accountId, selectedInst, gridSize, touch]);

  const requestToken = useCallback(async (ids: string[]) => {
    if (ids.length === 0) { setRelay(null); return; }
    const res = await fetch("/api/ops/camaras/relay-token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cameraIds: ids }),
    });
    const json = await res.json().catch(() => ({}));
    if (res.ok) setRelay({ token: json.token, relayUrl: json.relayUrl, streams: json.streams });
  }, []);

  const visibleIds = visible.map((c) => c.id).join(",");
  useEffect(() => {
    const ids = visibleIds ? visibleIds.split(",") : [];
    void requestToken(ids);
    const t = setInterval(() => void requestToken(ids), 9 * 60 * 1000);
    return () => clearInterval(t);
  }, [visibleIds, requestToken]);

  useEffect(() => {
    if (!cycling || touch || layouts.length < 2) return;
    const t = setInterval(() => {
      setLayoutId((cur) => {
        const idx = layouts.findIndex((l) => l.id === cur);
        return layouts[(idx + 1) % layouts.length].id;
      });
    }, 12000);
    return () => clearInterval(t);
  }, [cycling, touch, layouts]);

  const cols = touch ? 1 : Math.sqrt(gridSize);

  if (loading) return <div className="flex justify-center py-16"><Spinner /></div>;

  return (
    <div className="ds-page-enter space-y-4 min-w-0">
      <PageHero icon={Video} iconTone="emerald" title="Cámaras" subtitle="video wall" description="Monitoreo en vivo por instalación. El video sale directo del relay." />
      <CamaraWallToolbar
        cameras={cameras}
        accountId={accountId}
        onAccount={(id) => { setAccountId(id); setSelectedInst([]); setLayoutId(null); }}
        selectedInst={selectedInst}
        onToggleInst={(id) => setSelectedInst((cur) => cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id])}
        onClearInst={() => setSelectedInst([])}
        gridSize={gridSize}
        onGrid={setGridSize}
        cycling={cycling}
        onCycling={setCycling}
        showCycle={!touch && layouts.length > 1}
      />
      <CamaraLayoutBar
        layouts={layouts}
        activeId={layoutId}
        onSelect={(l) => { setLayoutId(l.id); setGridSize(l.gridSize); }}
        onCreate={(name) => void createLayout(name, gridSize, visible.map((c) => c.id), load)}
        onDelete={(id) => void deleteLayout(id, () => { setLayoutId(null); void load(); })}
      />
      {visible.length === 0 ? (
        <EmptyState icon={Video} title="Sin cámaras" description="Selecciona un cliente o registra cámaras en una instalación." />
      ) : (
        <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
          {visible.map((cam) => (
            <CamaraTile
              key={cam.id}
              camera={cam}
              token={relay?.token ?? null}
              relayUrl={relay?.relayUrl ?? null}
              live={cam.status !== "offline"}
              onOpen={() => setViewer(cam)}
              onUnauthorized={() => void requestToken(visible.map((c) => c.id))}
            />
          ))}
        </div>
      )}
      <CamaraViewerModal
        camera={viewer}
        token={relay?.token ?? null}
        relayUrl={relay?.relayUrl ?? null}
        onClose={() => setViewer(null)}
        onUnauthorized={() => viewer && void requestToken([viewer.id])}
      />
    </div>
  );
}
