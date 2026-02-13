"use client";

interface MapPoint {
  id: string;
  label: string;
  lat?: number | null;
  lng?: number | null;
  status?: string;
}

export function MonitoreoMap({ points }: { points: MapPoint[] }) {
  return (
    <div className="rounded-lg border border-border bg-card p-3 h-[300px] sm:h-[400px] lg:h-[600px] overflow-auto">
      <p className="text-xs text-muted-foreground mb-3">
        Mapa de monitoreo (modo inicial). Integrable con Google Maps en siguiente iteración.
      </p>
      <div className="space-y-2">
        {points.map((p) => (
          <div key={p.id} className="rounded border border-border p-2 text-xs">
            <p className="font-medium">{p.label}</p>
            <p className="text-muted-foreground">
              {p.lat != null && p.lng != null ? `${p.lat}, ${p.lng}` : "Sin coordenadas"}
            </p>
            {p.status && <p className="text-muted-foreground">Estado: {p.status}</p>}
          </div>
        ))}
        {!points.length && <p className="text-xs text-muted-foreground">Sin rondas activas.</p>}
      </div>
    </div>
  );
}
