"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { MapPin, Plus, Pencil, Trash2, Download, X, LocateFixed } from "lucide-react";
import { useGeolocation } from "@/lib/patrullaje/use-geolocation";
import { CheckpointTasksEditor, type TaskDraft } from "./checkpoint-tasks-editor";
import QRCode from "qrcode";

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

export interface CheckpointFormValue {
  installationId: string;
  name: string;
  description?: string;
  instrucciones?: string;
  lat?: number;
  lng?: number;
  geoRadiusM: number;
  verificationType?: string;
  isCritical?: boolean;
}

interface ExistingCheckpoint {
  id: string;
  name: string;
  description?: string;
  instrucciones?: string | null;
  lat?: number | null;
  lng?: number | null;
  geoRadiusM: number;
  verificationType: string;
  isCritical: boolean;
  isActive: boolean;
  qrCode?: string;
}

interface Props {
  installationId: string;
  installationName?: string;
  installationLat?: number | null;
  installationLng?: number | null;
  checkpoints: ExistingCheckpoint[];
  onSubmit: (payload: CheckpointFormValue) => Promise<string | void> | string | void;
  onUpdate: (id: string, payload: Partial<CheckpointFormValue>) => Promise<void> | void;
  onToggleActive: (id: string, isActive: boolean) => void;
  onDelete: (id: string) => void;
}

/* ------------------------------------------------------------------ */
/* Google Maps loader                                                  */
/* ------------------------------------------------------------------ */

const MAPS_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || "";

function loadMapsScript(): Promise<void> {
  return new Promise((resolve) => {
    const w = window as unknown as { google?: { maps?: { Map?: unknown } } };
    if (w.google?.maps?.Map) { resolve(); return; }
    const existing = document.getElementById("google-maps-picker-script");
    if (existing) { existing.addEventListener("load", () => resolve(), { once: true }); return; }
    const script = document.createElement("script");
    script.id = "google-maps-picker-script";
    script.src = `https://maps.googleapis.com/maps/api/js?key=${MAPS_KEY}&language=es&region=CL`;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    document.head.appendChild(script);
  });
}

/* ------------------------------------------------------------------ */
/* Verification type helpers                                           */
/* ------------------------------------------------------------------ */

const VERIFICATION_TYPES = [
  { value: "GEOFENCE", label: "Geocerca", icon: "📍", color: "emerald" },
  { value: "QR", label: "QR", icon: "🔲", color: "blue" },
  { value: "BOTH", label: "Ambos", icon: "📍🔲", color: "purple" },
] as const;

function verificationBadge(type: string) {
  const t = VERIFICATION_TYPES.find((v) => v.value === type) ?? VERIFICATION_TYPES[0];
  const colorMap: Record<string, string> = {
    emerald: "border-emerald-500/30 text-emerald-500",
    blue: "border-blue-500/30 text-blue-500",
    purple: "border-purple-500/30 text-purple-500",
  };
  return (
    <Badge variant="outline" className={colorMap[t.color]}>
      {t.icon} {t.label}
    </Badge>
  );
}

/* ------------------------------------------------------------------ */
/* Main Component                                                      */
/* ------------------------------------------------------------------ */

export function CheckpointMapCreator({
  installationId,
  installationName,
  installationLat,
  installationLng,
  checkpoints,
  onSubmit,
  onUpdate,
  onToggleActive,
  onDelete,
}: Props) {
  // Map refs
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);
  const circlesRef = useRef<any[]>([]);
  const draftMarkerRef = useRef<any>(null);
  const draftCircleRef = useRef<any>(null);
  const userMarkerRef = useRef<any>(null);
  const userCircleRef = useRef<any>(null);
  const installationMarkerRef = useRef<any>(null);
  const hasAutocenteredRef = useRef(false);

  const [mapReady, setMapReady] = useState(false);

  // Geolocation
  const { position: geoPos, requestPermission } = useGeolocation(true, 5000);

  // New checkpoint draft state
  const [isCreating, setIsCreating] = useState(false);
  const [draftLat, setDraftLat] = useState<number | null>(null);
  const [draftLng, setDraftLng] = useState<number | null>(null);
  const [draftName, setDraftName] = useState("");
  const [draftVerificationType, setDraftVerificationType] = useState("GEOFENCE");
  const [draftRadius, setDraftRadius] = useState(10);
  const [draftCritical, setDraftCritical] = useState(false);
  const [draftInstrucciones, setDraftInstrucciones] = useState("");
  const [draftTasks, setDraftTasks] = useState<TaskDraft[]>([]);
  const [saving, setSaving] = useState(false);
  const [downloadingQr, setDownloadingQr] = useState(false);
  const [editingCheckpointId, setEditingCheckpointId] = useState<string | null>(null);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const m = window.matchMedia("(max-width: 767px)");
    setIsMobile(m.matches);
    const on = () => setIsMobile(m.matches);
    m.addEventListener("change", on);
    return () => m.removeEventListener("change", on);
  }, []);

  // Initialize map
  useEffect(() => {
    if (!MAPS_KEY || !mapContainerRef.current) return;
    let mounted = true;

    void loadMapsScript().then(() => {
      const w = window as unknown as { google?: { maps?: any } };
      if (!mounted || !mapContainerRef.current || !w.google?.maps) return;

      const gm = w.google.maps;
      const center = new gm.LatLng(
        installationLat ?? -33.4489,
        installationLng ?? -70.6693,
      );

      const map = new gm.Map(mapContainerRef.current, {
        center,
        zoom: 17,
        mapTypeId: "satellite",
        streetViewControl: false,
        fullscreenControl: true,
        mapTypeControl: true,
        styles: [
          { featureType: "poi", stylers: [{ visibility: "off" }] },
        ],
      });

      // Click on map to place new checkpoint
      map.addListener("click", (ev: any) => {
        if (!ev.latLng) return;
        const lat = ev.latLng.lat();
        const lng = ev.latLng.lng();
        placeDraftMarker(lat, lng, gm, map);
      });

      mapRef.current = map;
      setMapReady(true);
    });

    return () => { mounted = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [installationId]);

  // Resize map when window/container changes (responsive)
  useEffect(() => {
    if (!mapReady || !mapRef.current) return;
    const w = window as unknown as { google?: { maps?: { event?: { trigger: (map: unknown, name: string) => void } } } };
    const map = mapRef.current;
    const onResize = () => {
      const center = map.getCenter?.();
      w.google?.maps?.event?.trigger(map, "resize");
      if (center) map.setCenter?.(center);
    };
    const ro = new ResizeObserver(onResize);
    if (mapContainerRef.current) ro.observe(mapContainerRef.current);
    window.addEventListener("resize", onResize);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", onResize);
    };
  }, [mapReady]);

  // Draw existing checkpoints on map
  useEffect(() => {
    if (!mapReady) return;
    const w = window as unknown as { google?: { maps?: any } };
    const gm = w.google?.maps;
    const map = mapRef.current;
    if (!gm || !map) return;

    // Clear old markers/circles
    markersRef.current.forEach((m) => m.setMap(null));
    circlesRef.current.forEach((c) => c.setMap(null));
    markersRef.current = [];
    circlesRef.current = [];

    // Draw installation marker
    installationMarkerRef.current?.setMap(null);
    installationMarkerRef.current = null;
    if (installationLat != null && installationLng != null) {
      const instPos = new gm.LatLng(installationLat, installationLng);
      installationMarkerRef.current = new gm.Marker({
        position: instPos,
        map,
        title: installationName ?? "Instalación",
        icon: {
          path: "M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5S10.62 6.5 12 6.5s2.5 1.12 2.5 2.5S13.38 11.5 12 11.5z",
          fillColor: "#3b82f6",
          fillOpacity: 1,
          strokeColor: "#1e40af",
          strokeWeight: 1.5,
          scale: 1.8,
          anchor: new gm.Point(12, 22),
        },
        zIndex: 997,
      });
      const instInfo = new gm.InfoWindow({
        content: `<div style="font-family:system-ui;font-size:13px;max-width:220px">
          <strong>📍 ${installationName ?? "Instalación"}</strong><br/>
          <span style="color:#666">Ubicación de la instalación</span>
        </div>`,
      });
      installationMarkerRef.current.addListener("click", () =>
        instInfo.open(map, installationMarkerRef.current),
      );
    }

    const activeCheckpoints = checkpoints.filter((cp) => cp.isActive && cp.lat != null && cp.lng != null);

    activeCheckpoints.forEach((cp, idx) => {
      const pos = new gm.LatLng(cp.lat!, cp.lng!);

      const marker = new gm.Marker({
        position: pos,
        map,
        title: cp.name,
        label: {
          text: String(idx + 1),
          color: "#fff",
          fontSize: "11px",
          fontWeight: "bold",
        },
        icon: {
          path: gm.SymbolPath.CIRCLE,
          fillColor: cp.isCritical ? "#ef4444" : "#10b981",
          fillOpacity: 1,
          strokeColor: "#fff",
          strokeWeight: 2,
          scale: 14,
        },
      });

      const circle = new gm.Circle({
        center: pos,
        radius: cp.geoRadiusM,
        map,
        fillColor: cp.isCritical ? "#ef4444" : "#10b981",
        fillOpacity: 0.08,
        strokeColor: cp.isCritical ? "#ef4444" : "#10b981",
        strokeOpacity: 0.3,
        strokeWeight: 1,
      });

      // Info window on click
      const infoWindow = new gm.InfoWindow({
        content: `<div style="font-family:system-ui;font-size:13px;max-width:200px">
          <strong>${cp.name}</strong><br/>
          <span style="color:#666">${cp.verificationType === "GEOFENCE" ? "📍 Geocerca" : cp.verificationType === "QR" ? "🔲 QR" : "📍🔲 Ambos"}</span><br/>
          <span style="color:#666">Radio: ${cp.geoRadiusM}m</span>
          ${cp.isCritical ? '<br/><span style="color:#ef4444">⚠ Crítico</span>' : ""}
        </div>`,
      });
      marker.addListener("click", () => infoWindow.open(map, marker));

      markersRef.current.push(marker);
      circlesRef.current.push(circle);
    });

    // Fit bounds to show all checkpoints
    if (activeCheckpoints.length > 0) {
      const bounds = new gm.LatLngBounds();
      activeCheckpoints.forEach((cp) => bounds.extend(new gm.LatLng(cp.lat!, cp.lng!)));
      if (installationLat != null && installationLng != null) {
        bounds.extend(new gm.LatLng(installationLat, installationLng));
      }
      map.fitBounds(bounds);
      // Cap zoom: min 16, max 19 for single checkpoints
      const listener = gm.event.addListenerOnce(map, "idle", () => {
        const z = map.getZoom();
        if (z != null && z < 16) map.setZoom(16);
        else if (activeCheckpoints.length === 1 && z != null && z > 19) map.setZoom(19);
      });
      // cleanup if effect re-runs before idle fires
      return () => gm.event.removeListener(listener);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapReady, checkpoints]);

  // Show user position as blue dot + auto-center on first fix
  useEffect(() => {
    if (!mapReady || !geoPos) return;
    const w = window as unknown as { google?: { maps?: any } };
    const gm = w.google?.maps;
    const map = mapRef.current;
    if (!gm || !map) return;

    const pos = new gm.LatLng(geoPos.lat, geoPos.lng);

    if (userMarkerRef.current) {
      userMarkerRef.current.setPosition(pos);
      userCircleRef.current?.setCenter(pos);
      userCircleRef.current?.setRadius(geoPos.accuracy);
    } else {
      userMarkerRef.current = new gm.Marker({
        position: pos,
        map,
        icon: {
          path: gm.SymbolPath.CIRCLE,
          fillColor: "#4285F4",
          fillOpacity: 1,
          strokeColor: "#fff",
          strokeWeight: 2,
          scale: 8,
        },
        zIndex: 998,
        clickable: false,
      });
      userCircleRef.current = new gm.Circle({
        center: pos,
        radius: geoPos.accuracy,
        map,
        fillColor: "#4285F4",
        fillOpacity: 0.15,
        strokeColor: "#4285F4",
        strokeOpacity: 0.3,
        strokeWeight: 1,
        clickable: false,
      });
    }

    // Auto-center on first fix when installation has no coords
    if (!hasAutocenteredRef.current) {
      hasAutocenteredRef.current = true;
      if (installationLat == null || installationLng == null) {
        map.panTo(pos);
        map.setZoom(16);
      }
    }
  }, [mapReady, geoPos, installationLat, installationLng]);

  // Place draft marker
  const placeDraftMarker = useCallback((lat: number, lng: number, gm?: any, map?: any) => {
    const w = window as unknown as { google?: { maps?: any } };
    const googleMaps = gm ?? w.google?.maps;
    const mapInstance = map ?? mapRef.current;
    if (!googleMaps || !mapInstance) return;

    // Remove previous draft
    draftMarkerRef.current?.setMap(null);
    draftCircleRef.current?.setMap(null);

    const pos = new googleMaps.LatLng(lat, lng);

    const marker = new googleMaps.Marker({
      position: pos,
      map: mapInstance,
      draggable: true,
      icon: {
        path: googleMaps.SymbolPath.CIRCLE,
        fillColor: "#f59e0b",
        fillOpacity: 1,
        strokeColor: "#fff",
        strokeWeight: 2,
        scale: 14,
      },
      label: {
        text: "+",
        color: "#fff",
        fontSize: "16px",
        fontWeight: "bold",
      },
      zIndex: 999,
    });

    const circle = new googleMaps.Circle({
      center: pos,
      radius: draftRadius,
      map: mapInstance,
      fillColor: "#f59e0b",
      fillOpacity: 0.12,
      strokeColor: "#f59e0b",
      strokeOpacity: 0.4,
      strokeWeight: 1,
    });

    marker.addListener("dragend", (ev: any) => {
      if (!ev.latLng) return;
      setDraftLat(ev.latLng.lat());
      setDraftLng(ev.latLng.lng());
      circle.setCenter(ev.latLng);
    });

    draftMarkerRef.current = marker;
    draftCircleRef.current = circle;
    setDraftLat(lat);
    setDraftLng(lng);
    setIsCreating(true);
  }, [draftRadius]);

  // Update draft circle radius
  useEffect(() => {
    if (draftCircleRef.current) {
      draftCircleRef.current.setRadius(draftRadius);
    }
  }, [draftRadius]);

  // Cancel creating/editing
  const cancelDraft = () => {
    draftMarkerRef.current?.setMap(null);
    draftCircleRef.current?.setMap(null);
    draftMarkerRef.current = null;
    draftCircleRef.current = null;
    setIsCreating(false);
    setEditingCheckpointId(null);
    setDraftLat(null);
    setDraftLng(null);
    setDraftName("");
    setDraftVerificationType("GEOFENCE");
    setDraftRadius(10);
    setDraftCritical(false);
    setDraftInstrucciones("");
    setDraftTasks([]);
  };

  // Start editing an existing checkpoint
  const startEditing = useCallback((cp: ExistingCheckpoint) => {
    // Cancel any current draft first
    draftMarkerRef.current?.setMap(null);
    draftCircleRef.current?.setMap(null);
    draftMarkerRef.current = null;
    draftCircleRef.current = null;

    setEditingCheckpointId(cp.id);
    setDraftName(cp.name);
    setDraftVerificationType(cp.verificationType);
    setDraftRadius(cp.geoRadiusM);
    setDraftCritical(cp.isCritical);
    setDraftInstrucciones(cp.instrucciones ?? "");
    setDraftLat(cp.lat ?? null);
    setDraftLng(cp.lng ?? null);
    setDraftTasks([]);
    setIsCreating(true);

    // Load existing tasks for this checkpoint
    fetch(`/api/ops/rondas/checkpoints/${cp.id}/tasks`)
      .then((r) => r.json())
      .then((json) => {
        if (json.success && Array.isArray(json.data)) {
          setDraftTasks(
            json.data.map((t: any) => ({
              id: t.id,
              label: t.label,
              type: t.type,
              required: t.required,
              options: t.options ?? undefined,
              config: t.config ?? undefined,
            })),
          );
        }
      })
      .catch(() => {});

    // Place draft marker on the checkpoint's position
    if (cp.lat != null && cp.lng != null) {
      const w = window as unknown as { google?: { maps?: any } };
      const gm = w.google?.maps;
      const map = mapRef.current;
      if (gm && map) {
        placeDraftMarker(cp.lat, cp.lng, gm, map);
        map.panTo(new gm.LatLng(cp.lat, cp.lng));
      }
    }
  }, [placeDraftMarker]);

  // Save tasks for a checkpoint (sync: delete removed, update existing, create new)
  const saveTasks = async (checkpointId: string, tasks: TaskDraft[]) => {
    const baseUrl = `/api/ops/rondas/checkpoints/${checkpointId}/tasks`;

    // Get existing tasks from server
    const existingRes = await fetch(baseUrl);
    const existingJson = await existingRes.json();
    const existingTasks: Array<{ id: string }> = existingJson.success ? existingJson.data : [];
    const existingIds = new Set(existingTasks.map((t) => t.id));
    const draftIds = new Set(tasks.filter((t) => t.id).map((t) => t.id!));

    // Delete removed tasks
    for (const et of existingTasks) {
      if (!draftIds.has(et.id)) {
        await fetch(`${baseUrl}/${et.id}`, { method: "DELETE" });
      }
    }

    // Create or update tasks
    for (let i = 0; i < tasks.length; i++) {
      const task = tasks[i];
      const body = {
        checkpointId,
        label: task.label,
        type: task.type,
        required: task.required,
        options: task.options ?? null,
        config: task.config ?? null,
        sortOrder: i,
      };

      if (task.id && existingIds.has(task.id)) {
        await fetch(`${baseUrl}/${task.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
      } else {
        await fetch(baseUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
      }
    }
  };

  // Save checkpoint (create or update)
  const handleSave = async () => {
    if (!draftName.trim() || draftLat == null || draftLng == null) return;
    setSaving(true);
    try {
      if (editingCheckpointId) {
        await onUpdate(editingCheckpointId, {
          name: draftName.trim(),
          lat: draftLat,
          lng: draftLng,
          geoRadiusM: draftRadius,
          verificationType: draftVerificationType,
          isCritical: draftCritical,
          instrucciones: draftInstrucciones.trim() || undefined,
        });
        // Save tasks for existing checkpoint
        await saveTasks(editingCheckpointId, draftTasks);
      } else {
        const createdId = await onSubmit({
          installationId,
          name: draftName.trim(),
          lat: draftLat,
          lng: draftLng,
          geoRadiusM: draftRadius,
          verificationType: draftVerificationType,
          isCritical: draftCritical,
          instrucciones: draftInstrucciones.trim() || undefined,
        });
        // Save tasks for newly created checkpoint
        if (createdId && draftTasks.length > 0) {
          await saveTasks(createdId, draftTasks);
        }
      }
      cancelDraft();
    } finally {
      setSaving(false);
    }
  };

  // Download all QR codes
  const handleDownloadQrs = async () => {
    const activeWithQr = checkpoints.filter((cp) => cp.isActive && cp.qrCode);
    if (activeWithQr.length === 0) return;

    setDownloadingQr(true);
    try {
      // Create a canvas-based PDF-like printable HTML
      const qrImages = await Promise.all(
        activeWithQr.map(async (cp) => {
          const dataUrl = await QRCode.toDataURL(cp.qrCode!, { width: 200, margin: 1 });
          return { name: cp.name, code: cp.qrCode!, dataUrl };
        }),
      );

      // Create printable HTML
      const html = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>QR Checkpoints - ${installationName ?? "Instalación"}</title>
<style>
  body { font-family: system-ui, sans-serif; margin: 0; padding: 20px; }
  h1 { font-size: 18px; text-align: center; margin-bottom: 20px; }
  .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; }
  .card { text-align: center; border: 1px solid #ddd; border-radius: 8px; padding: 16px; break-inside: avoid; }
  .card img { width: 150px; height: 150px; }
  .card .name { font-weight: 600; font-size: 14px; margin-top: 8px; }
  .card .code { font-size: 10px; color: #666; margin-top: 4px; word-break: break-all; }
  @media print { .grid { grid-template-columns: repeat(3, 1fr); } }
</style></head>
<body>
  <h1>Checkpoints QR — ${installationName ?? "Instalación"}</h1>
  <div class="grid">
    ${qrImages.map((q) => `
      <div class="card">
        <img src="${q.dataUrl}" alt="${q.name}" />
        <div class="name">${q.name}</div>
        <div class="code">${q.code}</div>
      </div>
    `).join("")}
  </div>
</body></html>`;

      const blob = new Blob([html], { type: "text/html" });
      const url = URL.createObjectURL(blob);
      const win = window.open(url, "_blank");
      if (win) {
        win.onload = () => {
          setTimeout(() => win.print(), 500);
        };
      }
      URL.revokeObjectURL(url);
    } finally {
      setDownloadingQr(false);
    }
  };

  if (!MAPS_KEY) {
    return (
      <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
        <MapPin className="mx-auto mb-2 h-8 w-8 opacity-50" />
        <p>Falta <code>NEXT_PUBLIC_GOOGLE_MAPS_API_KEY</code> para usar el mapa interactivo.</p>
      </div>
    );
  }

  const activeCheckpoints = checkpoints.filter((cp) => cp.isActive);

  const creationFormContent = (
    <>
      <div className="text-[11px] text-muted-foreground">
        {draftLat != null && draftLng != null
          ? `${draftLat.toFixed(6)}, ${draftLng.toFixed(6)}`
          : "Selecciona punto en el mapa"}
      </div>

      <div className="space-y-2">
        <Input
          value={draftName}
          onChange={(e) => setDraftName(e.target.value)}
          placeholder="Nombre del checkpoint"
          className="h-9 text-sm"
          autoFocus={!isMobile}
        />

        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Verificación</label>
          <div className="flex gap-1">
            {VERIFICATION_TYPES.map((vt) => (
              <button
                key={vt.value}
                type="button"
                onClick={() => setDraftVerificationType(vt.value)}
                className={`flex-1 rounded border px-2 py-2 text-xs transition-colors touch-manipulation ${
                  draftVerificationType === vt.value
                    ? "border-primary/40 bg-primary/10 text-foreground"
                    : "border-border text-muted-foreground hover:border-border/60"
                }`}
              >
                {vt.icon} {vt.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
            Radio geocerca: {draftRadius}m
          </label>
          <input
            type="range"
            min={10}
            max={500}
            step={5}
            value={draftRadius}
            onChange={(e) => setDraftRadius(Number(e.target.value))}
            className="w-full accent-primary touch-manipulation"
          />
          <div className="flex justify-between text-[10px] text-muted-foreground">
            <span>10m</span>
            <span>500m</span>
          </div>
        </div>

        <label className="flex items-center gap-2 text-sm cursor-pointer touch-manipulation min-h-[44px]">
          <input
            type="checkbox"
            checked={draftCritical}
            onChange={(e) => setDraftCritical(e.target.checked)}
            className="rounded w-4 h-4"
          />
          <span>⚠ Checkpoint crítico</span>
        </label>

        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">
            Instrucciones para el guardia
          </label>
          <textarea
            className="w-full rounded border border-border bg-background px-2 py-1.5 text-sm resize-none"
            rows={3}
            placeholder="Ej: Verificar que la puerta esté cerrada. Revisar cámara #3."
            value={draftInstrucciones}
            onChange={(e) => setDraftInstrucciones(e.target.value)}
            maxLength={500}
          />
          <p className="text-[10px] text-muted-foreground">
            El guardia verá estas instrucciones al marcar este checkpoint.
          </p>
        </div>

        {/* Checkpoint Tasks */}
        <CheckpointTasksEditor
          tasks={draftTasks}
          onChange={setDraftTasks}
        />
      </div>

      <Button
        type="button"
        className="w-full h-11 text-base touch-manipulation"
        onClick={handleSave}
        disabled={saving || !draftName.trim() || draftLat == null}
      >
        {saving ? "Guardando..." : editingCheckpointId ? "Guardar cambios" : "Crear checkpoint"}
      </Button>
    </>
  );

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {activeCheckpoints.length > 0 && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={handleDownloadQrs}
              disabled={downloadingQr}
            >
              <Download className="h-3.5 w-3.5" />
              {downloadingQr ? "Generando..." : "Descargar QRs"}
            </Button>
          )}
          {!isMobile && (
            <span className="text-xs text-muted-foreground">
              Click en el mapa para agregar checkpoint
            </span>
          )}
        </div>
      </div>

      {/* Map + Side Panel layout */}
      <div className={`flex gap-3 ${isMobile ? "flex-col" : "flex-row"}`}>
        {/* Map - full width, rectangular, responsive (no cut-off) */}
        <div className="flex-1 min-w-0 relative w-full">
          <div
            ref={mapContainerRef}
            className="w-full rounded-lg border border-border min-h-[400px] h-[calc(100vh-280px)]"
          />
          {/* Locate me button */}
          <button
            type="button"
            title="Mi ubicación"
            className="absolute bottom-4 left-3 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-white shadow-md border border-gray-200 hover:bg-gray-50 active:bg-gray-100 transition-colors"
            onClick={() => {
              const map = mapRef.current;
              if (!map) return;
              if (geoPos) {
                map.panTo({ lat: geoPos.lat, lng: geoPos.lng });
                map.setZoom(17);
              } else {
                requestPermission();
              }
            }}
          >
            <LocateFixed className="h-5 w-5 text-gray-600" />
          </button>
          {isMobile && !isCreating && (
            <p className="text-xs text-muted-foreground mt-2 text-center">
              Toca el mapa para agregar un checkpoint
            </p>
          )}
        </div>

        {/* Desktop: creation panel as sidebar */}
        {isCreating && !isMobile && (
          <div className="w-72 shrink-0 rounded-lg border border-amber-500/30 bg-card p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-semibold flex items-center gap-1.5">
                {editingCheckpointId ? (
                  <><Pencil className="h-4 w-4 text-amber-500" /> Editar checkpoint</>
                ) : (
                  <><Plus className="h-4 w-4 text-amber-500" /> Nuevo checkpoint</>
                )}
              </h4>
              <button type="button" onClick={cancelDraft} className="text-muted-foreground hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            </div>
            {creationFormContent}
          </div>
        )}
      </div>

      {/* Mobile: bottom sheet with form */}
      <Sheet open={isCreating && isMobile} onOpenChange={(open) => !open && cancelDraft()}>
        <SheetContent
          side="bottom"
          className="rounded-t-2xl max-h-[85vh] overflow-y-auto pb-8"
        >
          <SheetHeader className="text-left">
            <SheetTitle className="flex items-center gap-1.5">
              {editingCheckpointId ? (
                <><Pencil className="h-4 w-4 text-amber-500" /> Editar checkpoint</>
              ) : (
                <><Plus className="h-4 w-4 text-amber-500" /> Nuevo checkpoint</>
              )}
            </SheetTitle>
          </SheetHeader>
          <div className="space-y-3 pt-4">
            {creationFormContent}
          </div>
        </SheetContent>
      </Sheet>

      {/* Checkpoint List */}
      {checkpoints.length > 0 && (
        <div className="space-y-1.5">
          <h4 className="text-xs font-medium text-muted-foreground">
            Checkpoints ({activeCheckpoints.length} activos)
          </h4>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
            {checkpoints.map((cp, idx) => (
              <div
                key={cp.id}
                className={`rounded-lg border p-3 space-y-1 ${
                  cp.isActive ? "border-border bg-card" : "border-border/50 bg-card/50 opacity-60"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium flex items-center gap-1.5">
                      <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-muted text-[10px] font-bold shrink-0">
                        {idx + 1}
                      </span>
                      {cp.name}
                    </p>
                    {cp.description && (
                      <p className="text-[11px] text-muted-foreground mt-0.5">{cp.description}</p>
                    )}
                  </div>
                  {cp.isCritical && (
                    <Badge variant="outline" className="border-red-500/30 text-red-500 text-[10px] shrink-0">
                      ⚠ Crítico
                    </Badge>
                  )}
                </div>

                <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                  {verificationBadge(cp.verificationType)}
                  <span>{cp.geoRadiusM}m</span>
                  {cp.lat != null && cp.lng != null && (
                    <span className="truncate">
                      {cp.lat.toFixed(5)}, {cp.lng.toFixed(5)}
                    </span>
                  )}
                </div>

                <div className="flex gap-1 pt-1">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-6 text-[10px] px-2"
                    onClick={() => startEditing(cp)}
                  >
                    <Pencil className="h-3 w-3 mr-0.5" />
                    Editar
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-6 text-[10px] px-2"
                    onClick={() => onToggleActive(cp.id, !cp.isActive)}
                  >
                    {cp.isActive ? "Desactivar" : "Activar"}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-6 text-[10px] px-2 text-red-500"
                    onClick={() => onDelete(cp.id)}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
