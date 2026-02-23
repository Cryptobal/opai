"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Package } from "lucide-react";
import { Button } from "@/components/ui/button";

type Assignment = {
  id: string;
  quantity: number;
  unitCost: number;
  totalCost: number;
  deliveredAt: string;
  variant: {
    product: { name: string };
    size: { sizeCode: string } | null;
  };
  movement: {
    date: string;
    installation: { name: string } | null;
  };
};

export function InventarioGuardiaAssignmentsSection({ guardiaId }: { guardiaId: string }) {
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(true);

  const [totalCost, setTotalCost] = useState<number>(0);

  useEffect(() => {
    fetch(`/api/ops/inventario/guardia-assignments?guardiaId=${guardiaId}`)
      .then((r) => r.json())
      .then((data) => {
        if (data?.assignments) {
          setAssignments(data.assignments);
          setTotalCost(data.totalAssignedCost ?? 0);
        } else if (Array.isArray(data)) {
          setAssignments(data);
          setTotalCost(0);
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [guardiaId]);

  if (loading) {
    return (
      <div className="text-sm text-muted-foreground py-4">Cargando uniformes...</div>
    );
  }

  if (assignments.length === 0) {
    return (
      <div className="space-y-2">
        <p className="text-sm text-muted-foreground">
          Sin uniformes asignados. Las entregas se registran desde Inventario → Entregas.
        </p>
        <Link href="/ops/inventario/entregas">
          <Button variant="outline" size="sm">
            <Package className="h-4 w-4 mr-2" />
            Ir a Entregas
          </Button>
        </Link>
      </div>
    );
  }

  const formatCurrency = (n: number) =>
    new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP" }).format(n);

  return (
    <div className="space-y-3">
      {totalCost > 0 && (
        <div className="rounded-lg border bg-muted/30 p-3">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Costo total asignado
          </p>
          <p className="text-lg font-semibold">{formatCurrency(totalCost)}</p>
        </div>
      )}
      <div className="rounded-lg border divide-y">
        {assignments.map((a) => (
          <div key={a.id} className="flex items-center justify-between p-3">
            <div>
              <p className="font-medium">
                {a.variant.product.name}
                {a.variant.size && ` ${a.variant.size.sizeCode}`}
              </p>
              <p className="text-xs text-muted-foreground">
                Cantidad: {a.quantity} · Entregado:{" "}
                {new Date(a.deliveredAt).toLocaleDateString("es-CL")}
                {a.movement.installation && ` · ${a.movement.installation.name}`}
                {a.totalCost > 0 && ` · ${formatCurrency(a.totalCost)}`}
              </p>
            </div>
          </div>
        ))}
      </div>
      <Link href="/ops/inventario/entregas">
        <Button variant="outline" size="sm">
          Ver todas las entregas
        </Button>
      </Link>
    </div>
  );
}
