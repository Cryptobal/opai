"use client";

import { useEffect, useMemo } from "react";
import { MapContainer, TileLayer, CircleMarker, Tooltip, Popup } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import type { InstallationRow } from "./InstallationTicketCard";

interface Props {
  rows: InstallationRow[];
  onSelect: (installationId: string, name: string, total: number) => void;
}

const CHILE_CENTER: [number, number] = [-33.45, -70.65];
const CHILE_ZOOM = 5;

function pinColor(row: InstallationRow): string {
  if (row.totalActive === 0) return "#888780";
  if (row.slaBreached > 0 || row.byPriority.p1 > 0) return "#E24B4A";
  if (row.byPriority.p2 > 0) return "#EF9F27";
  return "#FAC775";
}

function pinRadius(total: number): number {
  if (total === 0) return 6;
  // 1 ticket → 8px, 20 tickets → 32px
  return Math.min(32, 8 + total * 1.2);
}

export function TicketsByInstallationMap({ rows, onSelect }: Props) {
  const pins = useMemo(
    () => rows.filter((r) => r.lat != null && r.lng != null),
    [rows],
  );
  const withoutCoords = rows.length - pins.length;

  // Adjust leaflet default icon paths that break with Next bundling (no markers used,
  // but CircleMarker relies on the stylesheet which is imported above).
  useEffect(() => {
    // no-op placeholder; ensures effect runs client-side so lazy CSS is applied
  }, []);

  return (
    <div className="relative">
      <MapContainer
        center={CHILE_CENTER}
        zoom={CHILE_ZOOM}
        style={{ height: "560px", width: "100%", borderRadius: "0.5rem" }}
        scrollWheelZoom
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {pins.map((row) => (
          <CircleMarker
            key={row.installationId}
            center={[row.lat as number, row.lng as number]}
            radius={pinRadius(row.totalActive)}
            pathOptions={{
              color: pinColor(row),
              fillColor: pinColor(row),
              fillOpacity: 0.6,
              weight: 2,
            }}
          >
            <Tooltip direction="top" offset={[0, -6]}>
              <span className="font-medium">{row.installationName}</span>
              <span className="ml-1 opacity-80">({row.totalActive})</span>
            </Tooltip>
            <Popup>
              <div className="min-w-[180px] space-y-1 text-xs">
                <div className="font-semibold">{row.installationName}</div>
                {row.clientName && (
                  <div className="text-muted-foreground">{row.clientName}</div>
                )}
                <div className="flex gap-3 pt-1">
                  <span>
                    <span className="font-semibold">{row.totalActive}</span> activos
                  </span>
                  {row.slaBreached > 0 && (
                    <span className="text-status-danger-fg">
                      <span className="font-semibold">{row.slaBreached}</span> venc
                    </span>
                  )}
                </div>
                <div className="flex gap-2 text-[11px]">
                  <span>P1: <b>{row.byPriority.p1}</b></span>
                  <span>P2: <b>{row.byPriority.p2}</b></span>
                  <span>P3: <b>{row.byPriority.p3}</b></span>
                  <span>P4: <b>{row.byPriority.p4}</b></span>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    onSelect(row.installationId, row.installationName, row.totalActive)
                  }
                  className="mt-1 w-full rounded-md bg-primary px-2 py-1 text-xs font-medium text-primary-foreground hover:opacity-90"
                >
                  Ver tickets
                </button>
              </div>
            </Popup>
          </CircleMarker>
        ))}
      </MapContainer>
      {withoutCoords > 0 && (
        <div className="mt-2 text-[11px] text-muted-foreground">
          {withoutCoords} {withoutCoords === 1 ? "instalación no se muestra" : "instalaciones no se muestran"} en el mapa (sin coordenadas).
        </div>
      )}
    </div>
  );
}
