"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Package } from "lucide-react";
import { Button } from "@/components/ui/button";
import { InventoryReceptionBadge, receptionStatusFromMovement } from "@/components/inventario/InventoryReceptionBadge";

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
    confirmationStatus?: string;
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
      <div className="text-sm text-ds-text-3 py-4">Cargando uniformes...</div>
    );
  }

  if (assignments.length === 0) {
    return (
      <div className="space-y-2">
        <p className="text-sm text-ds-text-3">
          Sin uniformes asignados. Las entregas se registran desde Inventario → Entregas.
        </p>
        <Link href="/ops/inventario/entregas">
          <Button variant="outline" size="sm" className="h-10 sm:h-9">
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
        <div className="rounded-ds-md border border-ds-border-default bg-ds-surface-2 p-3">
          <p className="text-[11px] font-mono uppercase tracking-[0.08em] text-ds-text-4">
            Costo total asignado
          </p>
          <p className="font-display text-lg font-semibold ds-num text-ds-text-1">{formatCurrency(totalCost)}</p>
        </div>
      )}
      <div className="rounded-ds-md border border-ds-border-default bg-ds-surface-1 divide-y divide-ds-border-subtle">
        {assignments.map((a) => (
          <div key={a.id} className="flex flex-wrap items-start justify-between gap-2 p-3">
            <div className="min-w-0 flex-1">
              <p className="text-[14px] font-medium text-ds-text-1">
                {a.variant.product.name}
                {a.variant.size && ` ${a.variant.size.sizeCode}`}
              </p>
              <p className="text-[12px] text-ds-text-3">
                Cantidad: {a.quantity} · Entregado:{" "}
                {new Date(a.deliveredAt).toLocaleDateString("es-CL")}
                {a.movement.installation && ` · ${a.movement.installation.name}`}
                {a.totalCost > 0 && ` · ${formatCurrency(a.totalCost)}`}
              </p>
            </div>
            <InventoryReceptionBadge
              status={receptionStatusFromMovement(a.movement.confirmationStatus)}
            />
          </div>
        ))}
      </div>
      <Link href="/ops/inventario/entregas">
        <Button variant="outline" size="sm" className="h-10 sm:h-9">
          Ver todas las entregas
        </Button>
      </Link>
    </div>
  );
}
