"use client";

import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import "@/components/portal/rondas/leaflet-setup";
import L from "leaflet";
import { MapContainer, TileLayer, Marker, Polyline, useMap } from "react-leaflet";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MapCheckpoint {
  id: string;
  name: string;
  lat: number;
  lng: number;
  status: "completed" | "active" | "pending";
  orderIndex: number;
}

export interface RondaMapProps {
  checkpoints: MapCheckpoint[];
  guardPosition?: { lat: number; lng: number } | null;
  height?: string;
  showRoute?: boolean;
  interactive?: boolean;
  showCenterButton?: boolean;
  onCenterGuard?: () => void;
  /** GPS trail points for ad-hoc rondas — rendered as a continuous polyline */
  trailPoints?: { lat: number; lng: number }[];
}

// ---------------------------------------------------------------------------
// Custom marker icons using L.divIcon
// ---------------------------------------------------------------------------

const MARKER_SIZE = 24;

function createCheckpointIcon(status: "completed" | "active" | "pending"): L.DivIcon {
  const colors: Record<string, { bg: string; border: string }> = {
    completed: { bg: "#22c55e", border: "#16a34a" },
    active: { bg: "#14b8a6", border: "#0d9488" },
    pending: { bg: "#52525b", border: "#3f3f46" },
  };

  const { bg, border } = colors[status];

  let inner = "";
  if (status === "completed") {
    inner = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" style="width:14px;height:14px;"><path d="M5 13l4 4L19 7"/></svg>`;
  } else if (status === "active") {
    inner = "";
  }

  const pulseRing =
    status === "active"
      ? `<span style="position:absolute;top:50%;left:50%;width:${MARKER_SIZE + 12}px;height:${MARKER_SIZE + 12}px;transform:translate(-50%,-50%);border-radius:50%;background:${bg};opacity:0.3;animation:ronda-pulse 1.5s ease-out infinite;"></span>`
      : "";

  const html = `
    <div style="position:relative;width:${MARKER_SIZE}px;height:${MARKER_SIZE}px;">
      ${pulseRing}
      <div style="position:relative;width:${MARKER_SIZE}px;height:${MARKER_SIZE}px;border-radius:50%;background:${bg};border:2px solid ${border};display:flex;align-items:center;justify-content:center;z-index:1;">
        ${inner}
      </div>
    </div>
  `;

  return L.divIcon({
    html,
    className: "",
    iconSize: [MARKER_SIZE, MARKER_SIZE],
    iconAnchor: [MARKER_SIZE / 2, MARKER_SIZE / 2],
  });
}

function createGuardIcon(): L.DivIcon {
  const size = 16;
  const outerSize = 32;
  const html = `
    <div style="position:relative;width:${outerSize}px;height:${outerSize}px;">
      <span style="position:absolute;top:50%;left:50%;width:${outerSize}px;height:${outerSize}px;transform:translate(-50%,-50%);border-radius:50%;background:rgba(59,130,246,0.25);animation:ronda-pulse 1.5s ease-out infinite;"></span>
      <div style="position:absolute;top:50%;left:50%;width:${size}px;height:${size}px;transform:translate(-50%,-50%);border-radius:50%;background:#3b82f6;border:2px solid #2563eb;z-index:1;"></div>
    </div>
  `;

  return L.divIcon({
    html,
    className: "",
    iconSize: [outerSize, outerSize],
    iconAnchor: [outerSize / 2, outerSize / 2],
  });
}

// Inject keyframes for pulse animation once
const PULSE_STYLE_ID = "ronda-map-pulse-style";

function ensurePulseStyle() {
  if (typeof document === "undefined") return;
  if (document.getElementById(PULSE_STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = PULSE_STYLE_ID;
  style.textContent = `
    @keyframes ronda-pulse {
      0% { transform: translate(-50%, -50%) scale(0.8); opacity: 0.4; }
      100% { transform: translate(-50%, -50%) scale(1.6); opacity: 0; }
    }
  `;
  document.head.appendChild(style);
}

// ---------------------------------------------------------------------------
// FitBounds helper component (uses useMap hook)
// ---------------------------------------------------------------------------

interface FitBoundsProps {
  checkpoints: MapCheckpoint[];
  guardPosition?: { lat: number; lng: number } | null;
}

function FitBounds({ checkpoints, guardPosition }: FitBoundsProps) {
  const map = useMap();
  const hasFitted = useRef(false);
  // Capture initial data so deps don't re-trigger on array reference changes
  const initialDataRef = useRef({ checkpoints, guardPosition });

  useEffect(() => {
    // Only fit bounds on initial mount — never re-zoom after checkpoint/trail updates
    if (hasFitted.current) return;

    const { checkpoints: cps, guardPosition: gp } = initialDataRef.current;
    const points: L.LatLngExpression[] = cps.map((cp) => [cp.lat, cp.lng]);
    if (gp) {
      points.push([gp.lat, gp.lng]);
    }
    if (points.length === 0) return;

    hasFitted.current = true;

    if (points.length === 1) {
      const [p] = points;
      map.setView(p as L.LatLngTuple, 19);
    } else {
      const bounds = L.latLngBounds(points as L.LatLngTuple[]);
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 19 });
    }
  }, [map]);

  return null;
}

// ---------------------------------------------------------------------------
// DisableInteraction helper component
// ---------------------------------------------------------------------------

function DisableInteraction() {
  const map = useMap();

  useEffect(() => {
    map.dragging.disable();
    map.touchZoom.disable();
    map.doubleClickZoom.disable();
    map.scrollWheelZoom.disable();
    map.boxZoom.disable();
    map.keyboard.disable();
    if ((map as unknown as Record<string, unknown>).tap) {
      (map as unknown as { tap: { disable: () => void } }).tap.disable();
    }

    return () => {
      map.dragging.enable();
      map.touchZoom.enable();
      map.doubleClickZoom.enable();
      map.scrollWheelZoom.enable();
      map.boxZoom.enable();
      map.keyboard.enable();
      if ((map as unknown as Record<string, unknown>).tap) {
        (map as unknown as { tap: { enable: () => void } }).tap.enable();
      }
    };
  }, [map]);

  return null;
}

// ---------------------------------------------------------------------------
// CenterButton helper component
// ---------------------------------------------------------------------------

interface CenterButtonProps {
  guardPosition: { lat: number; lng: number };
  onCenterGuard?: () => void;
}

function CenterButton({ guardPosition, onCenterGuard }: CenterButtonProps) {
  const map = useMap();

  const handleClick = useCallback(() => {
    map.setView([guardPosition.lat, guardPosition.lng], 19, { animate: true });
    onCenterGuard?.();
  }, [map, guardPosition, onCenterGuard]);

  return (
    <div
      style={{
        position: "absolute",
        top: 12,
        right: 12,
        zIndex: 1000,
      }}
    >
      <button
        onClick={handleClick}
        title="Centrar en guardia"
        style={{
          width: 36,
          height: 36,
          borderRadius: 8,
          border: "1px solid #3f3f46",
          background: "#18181b",
          color: "#d4d4d8",
          fontSize: 18,
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
          <circle cx="12" cy="12" r="3" />
        </svg>
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Route polylines
// ---------------------------------------------------------------------------

interface RoutePolylinesProps {
  checkpoints: MapCheckpoint[];
}

function RoutePolylines({ checkpoints }: RoutePolylinesProps) {
  const segments = useMemo(() => {
    const sorted = [...checkpoints].sort((a, b) => a.orderIndex - b.orderIndex);
    const result: { positions: L.LatLngExpression[]; color: string; dashed: boolean }[] = [];

    for (let i = 0; i < sorted.length - 1; i++) {
      const from = sorted[i];
      const to = sorted[i + 1];
      const positions: L.LatLngExpression[] = [
        [from.lat, from.lng],
        [to.lat, to.lng],
      ];

      let color: string;
      let dashed: boolean;

      if (from.status === "completed" && to.status === "completed") {
        color = "#22c55e";
        dashed = false;
      } else if (from.status === "completed" && to.status === "active") {
        color = "#14b8a6";
        dashed = false;
      } else {
        color = "#52525b";
        dashed = true;
      }

      result.push({ positions, color, dashed });
    }

    return result;
  }, [checkpoints]);

  return (
    <>
      {segments.map((seg, i) => (
        <Polyline
          key={i}
          positions={seg.positions}
          pathOptions={{
            color: seg.color,
            weight: 3,
            opacity: 0.8,
            dashArray: seg.dashed ? "8 6" : undefined,
          }}
        />
      ))}
    </>
  );
}

// ---------------------------------------------------------------------------
// Main RondaMap component
// ---------------------------------------------------------------------------

const TILE_URL =
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
const TILE_ATTRIBUTION =
  '&copy; Esri, Maxar, Earthstar Geographics';

// Default center (Mexico City) as fallback when no checkpoints
const DEFAULT_CENTER: L.LatLngExpression = [19.4326, -99.1332];

export default function RondaMap({
  checkpoints,
  guardPosition,
  height = "300px",
  showRoute = false,
  interactive = true,
  showCenterButton = false,
  onCenterGuard,
  trailPoints,
}: RondaMapProps) {
  const [mounted, setMounted] = useState(false);
  const mapRef = useRef<L.Map | null>(null);

  // Memoize icons to avoid re-creating on every render
  const checkpointIcons = useMemo(() => {
    const icons: Record<string, L.DivIcon> = {};
    for (const status of ["completed", "active", "pending"] as const) {
      icons[status] = createCheckpointIcon(status);
    }
    return icons;
  }, []);

  const guardIcon = useMemo(() => createGuardIcon(), []);

  useEffect(() => {
    ensurePulseStyle();
    setMounted(true);
  }, []);

  // Loading placeholder
  if (!mounted) {
    return (
      <div
        style={{ height }}
        className="animate-pulse rounded-lg bg-zinc-900"
      />
    );
  }

  const center: L.LatLngExpression =
    checkpoints.length > 0
      ? [checkpoints[0].lat, checkpoints[0].lng]
      : guardPosition
        ? [guardPosition.lat, guardPosition.lng]
        : DEFAULT_CENTER;

  return (
    <div style={{ height }} className="relative isolate overflow-hidden rounded-lg">
      <MapContainer
        center={center}
        zoom={18}
        maxZoom={19}
        style={{ height: "100%", width: "100%" }}
        zoomControl={interactive}
        attributionControl={false}
        ref={mapRef}
      >
        <TileLayer url={TILE_URL} attribution={TILE_ATTRIBUTION} maxZoom={19} />

        {/* Auto-fit bounds */}
        <FitBounds checkpoints={checkpoints} guardPosition={guardPosition} />

        {/* Disable interaction if non-interactive */}
        {!interactive && <DisableInteraction />}

        {/* Route polylines */}
        {showRoute && checkpoints.length > 1 && (
          <RoutePolylines checkpoints={checkpoints} />
        )}

        {/* GPS trail polyline (ad-hoc rondas) */}
        {trailPoints && trailPoints.length > 1 && (
          <Polyline
            positions={trailPoints.map((p) => [p.lat, p.lng] as L.LatLngExpression)}
            pathOptions={{
              color: "#14b8a6",
              weight: 3,
              opacity: 0.5,
              dashArray: undefined,
            }}
          />
        )}

        {/* Checkpoint markers */}
        {checkpoints.map((cp) => (
          <Marker
            key={cp.id}
            position={[cp.lat, cp.lng]}
            icon={checkpointIcons[cp.status]}
            title={cp.name}
          />
        ))}

        {/* Guard position marker */}
        {guardPosition && (
          <Marker
            position={[guardPosition.lat, guardPosition.lng]}
            icon={guardIcon}
            title="Guardia"
          />
        )}

        {/* Center button */}
        {showCenterButton && guardPosition && (
          <CenterButton
            guardPosition={guardPosition}
            onCenterGuard={onCenterGuard}
          />
        )}
      </MapContainer>
    </div>
  );
}
