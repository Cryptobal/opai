"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Package, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";

type Movement = {
  id: string;
  date: string;
  guardia: { persona: { firstName: string; lastName: string } };
  lines: {
    variant: { product: { name: string }; size: { sizeCode: string } | null };
    quantity: number;
    unitCost?: number | null;
  }[];
};

type Asset = {
  id: string;
  phoneNumber: string | null;
  purchaseCost?: number | null;
  variant: { product: { name: string } } | null;
};

export function InventarioInstallationSection({ installationId }: { installationId: string }) {
  const [movements, setMovements] = useState<Movement[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch(`/api/ops/inventario/movements?type=delivery&installationId=${installationId}`).then(
        (r) => r.json()
      ),
      fetch(`/api/ops/inventario/assets?installationId=${installationId}`).then((r) => r.json()),
    ])
      .then(([mData, aData]) => {
        if (Array.isArray(mData)) setMovements(mData);
        if (Array.isArray(aData)) setAssets(aData);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [installationId]);

  if (loading) {
    return (
      <div className="text-sm text-muted-foreground py-4">Cargando uniformes y activos...</div>
    );
  }

  const hasData = movements.length > 0 || assets.length > 0;

  const uniformsCost = movements.reduce((sum, m) => {
    return (
      sum +
      m.lines.reduce(
        (lSum, l) => lSum + l.quantity * Number(l.unitCost ?? 0),
        0
      )
    );
  }, 0);
  const assetsCost = assets.reduce(
    (sum, a) => sum + Number(a.purchaseCost ?? 0),
    0
  );
  const totalCost = uniformsCost + assetsCost;
  const formatCurrency = (n: number) =>
    new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP" }).format(n);

  return (
    <div className="space-y-4">
      {totalCost > 0 && (
        <div className="rounded-lg border bg-muted/30 p-3">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Costo total (uniformes + activos)
          </p>
          <p className="text-lg font-semibold">{formatCurrency(totalCost)}</p>
          {(uniformsCost > 0 || assetsCost > 0) && (
            <p className="text-xs text-muted-foreground mt-1">
              Uniformes: {formatCurrency(uniformsCost)}
              {assetsCost > 0 && ` · Activos: ${formatCurrency(assetsCost)}`}
            </p>
          )}
        </div>
      )}
      {/* Uniformes entregados en esta instalación */}
      <div>
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
          <Package className="h-3.5 w-3.5" />
          Uniformes entregados
        </p>
        {movements.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Sin entregas registradas en esta instalación.
          </p>
        ) : (
          <div className="rounded-lg border divide-y">
            {movements.map((m) => (
              <div key={m.id} className="p-3">
                <p className="font-medium text-sm">
                  {new Date(m.date).toLocaleDateString("es-CL")} ·{" "}
                  {m.guardia.persona.firstName} {m.guardia.persona.lastName}
                </p>
                <ul className="text-xs text-muted-foreground mt-1">
                  {m.lines.map((l, i) => (
                    <li key={i}>
                      {l.quantity} x {l.variant.product.name}
                      {l.variant.size && ` ${l.variant.size.sizeCode}`}
                      {Number(l.unitCost ?? 0) > 0 &&
                        ` · ${formatCurrency(l.quantity * Number(l.unitCost!))}`}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Activos asignados */}
      <div>
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
          <Smartphone className="h-3.5 w-3.5" />
          Activos asignados
        </p>
        {assets.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sin activos asignados.</p>
        ) : (
          <div className="rounded-lg border divide-y">
            {assets.map((a) => (
              <div key={a.id} className="p-3 flex justify-between items-center">
                <div>
                  <p className="font-medium text-sm">
                    {a.variant?.product.name ?? "Activo"}
                    {a.phoneNumber && (
                      <span className="text-muted-foreground ml-2">{a.phoneNumber}</span>
                    )}
                  </p>
                  {Number(a.purchaseCost ?? 0) > 0 && (
                    <p className="text-xs text-muted-foreground">
                      {formatCurrency(Number(a.purchaseCost!))}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <Link href="/ops/inventario">
        <Button variant="outline" size="sm">
          Ir a Inventario
        </Button>
      </Link>
    </div>
  );
}
