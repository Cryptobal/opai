"use client";

import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import "@/components/portal/rondas/leaflet-setup";
import L from "leaflet";
import { MapContainer, TileLayer, Marker, Polyline, Circle, useMap } from "react-leaflet";

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
  /** When set, draws a dashed teal line from guard to the marking checkpoint */
  markingCheckpointId?: string | null;
  /** Follow mode: continuously center map on guard position */
  isFollowing?: boolean;
  /** Callback when user manually interacts with the map (drag/zoom) */
  onManualInteraction?: () => void;
  /** Callback for the re-center button */
  onRecenter?: () => void;
  /** GPS accuracy in meters — renders accuracy circle around guard */
  gpsAccuracy?: number | null;
}

// ---------------------------------------------------------------------------
// Custom marker icons using L.divIcon
// ---------------------------------------------------------------------------

const MARKER_SIZE = 30;

function createCheckpointIcon(
  status: "completed" | "active" | "pending",
  label?: string,
): L.DivIcon {
  const colors: Record<string, { bg: string; border: string; text: string }> = {
    completed: { bg: "#22c55e", border: "#16a34a", text: "#fff" },
    active: { bg: "#ffffff", border: "#14b8a6", text: "#0d9488" },
    pending: { bg: "#ffffff", border: "#71717a", text: "#52525b" },
  };

  const { bg, border, text } = colors[status];

  let inner = "";
  if (status === "completed") {
    inner = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" style="width:16px;height:16px;"><path d="M5 13l4 4L19 7"/></svg>`;
  } else if (label) {
    // Truncate label to keep it compact inside the marker circle
    const display = label.length > 3 ? label.slice(0, 2) : label;
    inner = `<span style="font-size:${display.length > 2 ? 10 : 13}px;font-weight:700;color:${text};line-height:1;">${display}</span>`;
  }

  const pulseRing =
    status === "active"
      ? `<span style="position:absolute;top:50%;left:50%;width:${MARKER_SIZE + 16}px;height:${MARKER_SIZE + 16}px;transform:translate(-50%,-50%);border-radius:50%;background:#14b8a6;opacity:0.3;animation:ronda-pulse 1.5s ease-out infinite;"></span>`
      : "";

  const shadow = "filter:drop-shadow(0 2px 4px rgba(0,0,0,0.5));";

  const html = `
    <div style="position:relative;width:${MARKER_SIZE}px;height:${MARKER_SIZE}px;">
      ${pulseRing}
      <div style="position:relative;width:${MARKER_SIZE}px;height:${MARKER_SIZE}px;border-radius:50%;background:${bg};border:3px solid ${border};display:flex;align-items:center;justify-content:center;z-index:1;${shadow}">
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
  const size = 18;
  const outerSize = 40;
  const html = `
    <div style="position:relative;width:${outerSize}px;height:${outerSize}px;">
      <span style="position:absolute;top:50%;left:50%;width:${outerSize}px;height:${outerSize}px;transform:translate(-50%,-50%);border-radius:50%;background:rgba(59,130,246,0.25);animation:ronda-pulse 1.5s ease-out infinite;"></span>
      <div style="position:absolute;top:50%;left:50%;width:${size}px;height:${size}px;transform:translate(-50%,-50%);border-radius:50%;background:#3b82f6;border:3px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,0.5);z-index:1;"></div>
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
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 18 });
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
// AutoFollowGuard helper component — auto-pans map to keep guard visible
// ---------------------------------------------------------------------------

function AutoFollowGuard({
  guardPosition,
  isFollowing,
  onManualInteraction,
}: {
  guardPosition: { lat: number; lng: number };
  isFollowing: boolean;
  onManualInteraction?: () => void;
}) {
  const map = useMap();
  const isFirstRender = useRef(true);

  // Detect manual interaction and notify parent
  useEffect(() => {
    const handleManual = () => onManualInteraction?.();
    map.on("dragstart", handleManual);
    map.on("zoomstart", handleManual);
    return () => {
      map.off("dragstart", handleManual);
      map.off("zoomstart", handleManual);
    };
  }, [map, onManualInteraction]);

  // Follow mode: center on every position change when active
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    if (!isFollowing) return;
    map.panTo(
      [guardPosition.lat, guardPosition.lng],
      { animate: true, duration: 0.3 },
    );
  }, [map, guardPosition.lat, guardPosition.lng, isFollowing]);

  return null;
}

// ---------------------------------------------------------------------------
// CenterButton helper component
// ---------------------------------------------------------------------------

function RecenterButton({
  guardPosition,
  onRecenter,
}: {
  guardPosition: { lat: number; lng: number };
  onRecenter?: () => void;
}) {
  const map = useMap();

  const handleClick = useCallback(() => {
    map.setView([guardPosition.lat, guardPosition.lng], map.getZoom(), { animate: true });
    onRecenter?.();
  }, [map, guardPosition, onRecenter]);

  return (
    <div style={{ position: "absolute", bottom: 16, right: 12, zIndex: 1000 }}>
      <button
        onClick={handleClick}
        title="Centrar en mi posicion"
        aria-label="Centrar en mi posicion"
        style={{
          width: 40,
          height: 40,
          borderRadius: "50%",
          border: "1px solid #52525b",
          background: "rgba(24,24,27,0.85)",
          backdropFilter: "blur(8px)",
          color: "#d4d4d8",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          boxShadow: "0 4px 12px rgba(0,0,0,0.4)",
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
        color = "#2DD4BF";
        dashed = true;
      }

      result.push({ positions, color, dashed });
    }

    return result;
  }, [checkpoints]);

  return (
    <>
      {/* White outline for contrast on satellite imagery */}
      {segments.map((seg, i) => (
        <Polyline
          key={`outline-${i}`}
          positions={seg.positions}
          pathOptions={{
            color: "#ffffff",
            weight: 6,
            opacity: 0.4,
          }}
        />
      ))}
      {segments.map((seg, i) => (
        <Polyline
          key={i}
          positions={seg.positions}
          pathOptions={{
            color: seg.color,
            weight: 4,
            opacity: 0.9,
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
  markingCheckpointId,
  isFollowing = true,
  onManualInteraction,
  onRecenter,
  gpsAccuracy,
}: RondaMapProps) {
  const [mounted, setMounted] = useState(false);
  const mapRef = useRef<L.Map | null>(null);

  // Memoize icons — keyed by "status-name" since each checkpoint shows its name
  const checkpointIcons = useMemo(() => {
    const icons: Record<string, L.DivIcon> = {};
    for (const cp of checkpoints) {
      const key = `${cp.status}-${cp.name}`;
      if (!icons[key]) {
        icons[key] = createCheckpointIcon(cp.status, cp.name);
      }
    }
    return icons;
  }, [checkpoints]);

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

        {/* GPS trail polyline — walked route (green, solid) */}
        {trailPoints && trailPoints.length > 1 && (
          <Polyline
            positions={trailPoints.map((p) => [p.lat, p.lng] as L.LatLngExpression)}
            pathOptions={{
              color: "#10B981",
              weight: 4,
              opacity: 0.8,
              dashArray: undefined,
            }}
          />
        )}

        {/* Checkpoint markers */}
        {checkpoints.map((cp) => (
          <Marker
            key={cp.id}
            position={[cp.lat, cp.lng]}
            icon={checkpointIcons[`${cp.status}-${cp.name}`]}
            title={cp.name}
          />
        ))}

        {/* Guard → marking checkpoint dashed line */}
        {guardPosition && markingCheckpointId && (() => {
          const target = checkpoints.find((cp) => cp.id === markingCheckpointId);
          if (!target) return null;
          return (
            <>
              <Polyline
                positions={[
                  [guardPosition.lat, guardPosition.lng],
                  [target.lat, target.lng],
                ]}
                pathOptions={{
                  color: "#ffffff",
                  weight: 5,
                  opacity: 0.3,
                }}
              />
              <Polyline
                positions={[
                  [guardPosition.lat, guardPosition.lng],
                  [target.lat, target.lng],
                ]}
                pathOptions={{
                  color: "#14b8a6",
                  weight: 3,
                  opacity: 0.8,
                  dashArray: "8 8",
                }}
              />
            </>
          );
        })()}

        {/* GPS accuracy circle */}
        {guardPosition && gpsAccuracy != null && gpsAccuracy > 15 && (
          <Circle
            center={[guardPosition.lat, guardPosition.lng]}
            radius={gpsAccuracy}
            pathOptions={{
              color: gpsAccuracy > 50 ? "#ef4444" : "#f59e0b",
              fillColor: gpsAccuracy > 50 ? "#ef4444" : "#f59e0b",
              fillOpacity: 0.08,
              weight: 1,
              dashArray: "4 4",
            }}
          />
        )}

        {/* Guard position marker */}
        {guardPosition && (
          <Marker
            position={[guardPosition.lat, guardPosition.lng]}
            icon={guardIcon}
            title="Guardia"
          />
        )}

        {/* Auto-follow guard when interactive */}
        {interactive && guardPosition && (
          <AutoFollowGuard
            guardPosition={guardPosition}
            isFollowing={isFollowing}
            onManualInteraction={onManualInteraction}
          />
        )}

        {/* Re-center button — shown when follow mode is off */}
        {interactive && guardPosition && !isFollowing && (
          <RecenterButton
            guardPosition={guardPosition}
            onRecenter={onRecenter ?? onCenterGuard}
          />
        )}
      </MapContainer>
    </div>
  );
}
