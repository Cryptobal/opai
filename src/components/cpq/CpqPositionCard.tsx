/**
 * Tarjeta de puesto de trabajo CPQ
 */

"use client";

import { useState } from "react";
import type { CSSProperties } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EditPositionModal } from "@/components/cpq/EditPositionModal";
import { CostBreakdownModal } from "@/components/cpq/CostBreakdownModal";
import { formatCurrency } from "@/components/cpq/utils";
import { cn } from "@/lib/utils";
import type { CpqPosition } from "@/types/cpq";
import { Copy, Pencil, RefreshCw, Trash2 } from "lucide-react";
import { toast } from "sonner";

interface CpqPositionCardProps {
  quoteId: string;
  position: CpqPosition;
  onUpdated?: () => void;
  readOnly?: boolean;
  salePriceMonthlyForPosition?: number;
  clientHourlyRate?: number;
}

function getTintedBadgeStyle(colorHex?: string | null): CSSProperties | undefined {
  if (!colorHex || !/^#[0-9a-f]{6}$/i.test(colorHex)) return undefined;
  return {
    backgroundColor: `${colorHex}1a`,
    borderColor: `${colorHex}5e`,
    color: colorHex,
  };
}

export function CpqPositionCard({
  quoteId,
  position,
  onUpdated,
  readOnly = false,
  salePriceMonthlyForPosition = 0,
  clientHourlyRate = 0,
}: CpqPositionCardProps) {
  const [openEdit, setOpenEdit] = useState(false);
  const [openBreakdown, setOpenBreakdown] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleRecalculate = async () => {
    setLoading(true);
    try {
      await fetch(`/api/cpq/quotes/${quoteId}/positions/${position.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ forceRecalculate: true }),
      });
      onUpdated?.();
    } catch (err) {
      console.error("Error recalculating position:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm("¿Eliminar este puesto?")) return;
    setLoading(true);
    try {
      await fetch(`/api/cpq/quotes/${quoteId}/positions/${position.id}`, {
        method: "DELETE",
      });
      onUpdated?.();
    } catch (err) {
      console.error("Error deleting position:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleClone = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/cpq/quotes/${quoteId}/positions/${position.id}/clone`, {
        method: "POST",
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      toast.success("Puesto clonado");
      onUpdated?.();
    } catch (err) {
      console.error("Error cloning position:", err);
      toast.error("No se pudo clonar el puesto");
    } finally {
      setLoading(false);
    }
  };

  const title = position.customName || position.puestoTrabajo?.name || "Puesto";
  const puestoName = position.puestoTrabajo?.name || "Puesto";
  const roleName = position.rol?.name || "—";
  const premiumBadgeClass =
    "h-6 max-w-[160px] rounded-full border px-2.5 text-[11px] font-medium leading-none tracking-[0.01em] truncate";

  return (
    <Card className="overflow-hidden border border-muted/40">
      <div className="flex items-start justify-between gap-3 border-b bg-muted/20 p-3">
        <div
          className={cn("flex-1", !readOnly && "cursor-pointer hover:text-primary transition-colors")}
          onClick={readOnly ? undefined : () => setOpenEdit(true)}
        >
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-sm font-semibold text-foreground">{title}</h3>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <Badge
              variant="outline"
              className={cn(premiumBadgeClass, "text-foreground/90")}
              style={getTintedBadgeStyle(position.puestoTrabajo?.colorHex)}
            >
              {puestoName}
            </Badge>
            <Badge
              variant="outline"
              className={cn(premiumBadgeClass, "text-foreground/90")}
              style={getTintedBadgeStyle(position.rol?.colorHex)}
            >
              {roleName}
            </Badge>
            <Badge
              variant="outline"
              className={cn(
                premiumBadgeClass,
                "border-emerald-500/30 bg-emerald-500/15 text-emerald-300"
              )}
            >
              {position.numGuards} {position.numGuards === 1 ? "guardia" : "guardias"}
            </Badge>
          </div>
        </div>
        {!readOnly && (
          <div className="flex items-center gap-1">
            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setOpenEdit(true)} title="Editar">
              <Pencil className="h-4 w-4" />
            </Button>
            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={handleClone} disabled={loading} title="Clonar">
              <Copy className="h-4 w-4" />
            </Button>
            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={handleRecalculate} disabled={loading} title="Recalcular costo">
              <RefreshCw className="h-4 w-4" />
            </Button>
            <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={handleDelete} disabled={loading} title="Eliminar">
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 p-3">
        <div className="rounded-md border border-border/60 bg-muted/20 p-2 text-foreground">
          <p className="text-xs uppercase text-muted-foreground">Base c/u</p>
          <p className="text-sm sm:text-xs font-semibold">{formatCurrency(Number(position.baseSalary))}</p>
        </div>
        <div className="rounded-md border border-border/60 bg-muted/20 p-2 text-foreground">
          <p className="text-xs uppercase text-muted-foreground">Líquido c/u</p>
          <p className="text-sm sm:text-xs font-semibold">
            {formatCurrency(Number(position.netSalary || 0))}
          </p>
        </div>
        <div className="rounded-md border border-border/60 bg-muted/20 p-2 text-foreground">
          <p className="text-xs uppercase text-muted-foreground">Valor hora cliente</p>
          <p className="text-sm sm:text-xs font-semibold">
            {formatCurrency(clientHourlyRate)}
          </p>
        </div>
      </div>

      <div className="flex items-center justify-between border-t bg-muted/10 px-3 py-2">
        <div className="flex flex-col gap-0.5 sm:flex-row sm:items-center sm:gap-3">
          <p className="text-xs sm:text-xs text-muted-foreground">
            Venta mensual puesto ({position.numGuards}):{" "}
            <span className="font-mono text-foreground">
              {formatCurrency(salePriceMonthlyForPosition)}
            </span>
          </p>
          <p className="text-xs sm:text-xs text-emerald-400">
            Valor hora:{" "}
            <span className="font-mono font-semibold">
              {formatCurrency(clientHourlyRate)}
            </span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" className="h-9 sm:h-7 px-3 sm:px-2 text-xs sm:text-xs" onClick={() => setOpenBreakdown(true)}>
            Ver desglose
          </Button>
        </div>
        <EditPositionModal
          quoteId={quoteId}
          position={position}
          open={openEdit}
          onOpenChange={setOpenEdit}
          onUpdated={onUpdated}
        />
        <CostBreakdownModal
          open={openBreakdown}
          onOpenChange={setOpenBreakdown}
          position={position}
        />
      </div>
    </Card>
  );
}
