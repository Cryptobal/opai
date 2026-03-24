"use client";

import { useEffect, useState } from "react";
import { Package, Smartphone, Loader2 } from "lucide-react";
import type { ClienteSession } from "@/lib/portal-cliente";

type Delivery = {
  id: string;
  date: string;
  guardiaName: string | null;
  items: { product: string; size: string | null; quantity: number }[];
};

type Asset = {
  id: string;
  product: string;
  assignedAt: string;
};

type EquipData = {
  installationName: string;
  deliveries: Delivery[];
  assets: Asset[];
};

interface Props {
  session: ClienteSession;
  selectedInstallation: string | null;
}

export function PortalEquipamiento({ session, selectedInstallation }: Props) {
  const [data, setData] = useState<EquipData | null>(null);
  const [loading, setLoading] = useState(true);

  const installationId = selectedInstallation || session.installations?.[0]?.id;

  useEffect(() => {
    if (!installationId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    fetch(`/api/portal/cliente/instalaciones/${installationId}/equipamiento`)
      .then((r) => r.json())
      .then((res) => {
        if (res.success) setData(res);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [installationId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!installationId) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center p-6">
        <Package className="h-12 w-12 text-zinc-600 mb-3" />
        <p className="text-zinc-400 text-sm">No hay instalaciones asociadas.</p>
      </div>
    );
  }

  const deliveries = data?.deliveries ?? [];
  const assets = data?.assets ?? [];
  const hasData = deliveries.length > 0 || assets.length > 0;

  return (
    <div className="flex-1 max-w-4xl mx-auto w-full px-4 py-4 pb-24 space-y-6">
      <div>
        <h2 className="text-xl font-semibold">Equipamiento</h2>
        <p className="text-sm text-muted-foreground">
          Entregas de uniformes y activos en {data?.installationName || "esta instalación"}
        </p>
      </div>

      {!hasData ? (
        <div className="flex flex-col items-center justify-center h-48 text-center rounded-lg border bg-muted/20 p-6">
          <Package className="h-10 w-10 text-zinc-500 mb-2" />
          <p className="text-sm text-muted-foreground">
            No hay entregas registradas en esta instalación.
          </p>
        </div>
      ) : (
        <>
          {/* Uniform deliveries */}
          {deliveries.length > 0 && (
            <div>
              <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-1.5">
                <Package className="h-3.5 w-3.5" />
                Entregas de uniformes ({deliveries.length})
              </h3>
              <div className="space-y-2">
                {deliveries.map((d) => (
                  <div key={d.id} className="rounded-lg border bg-card p-3">
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="font-medium text-sm">
                          {new Date(d.date).toLocaleDateString("es-CL", {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                          })}
                        </p>
                        {d.guardiaName && (
                          <p className="text-xs text-muted-foreground">
                            Guardia: {d.guardiaName}
                          </p>
                        )}
                      </div>
                    </div>
                    <ul className="mt-2 space-y-0.5">
                      {d.items.map((item, idx) => (
                        <li key={idx} className="text-xs text-muted-foreground">
                          {item.quantity}x {item.product}
                          {item.size && ` (${item.size})`}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Assets */}
          {assets.length > 0 && (
            <div>
              <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-1.5">
                <Smartphone className="h-3.5 w-3.5" />
                Activos asignados ({assets.length})
              </h3>
              <div className="space-y-2">
                {assets.map((a) => (
                  <div key={a.id} className="rounded-lg border bg-card p-3 flex justify-between items-center">
                    <p className="font-medium text-sm">{a.product}</p>
                    <p className="text-xs text-muted-foreground">
                      Desde {new Date(a.assignedAt).toLocaleDateString("es-CL")}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
