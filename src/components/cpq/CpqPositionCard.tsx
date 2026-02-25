/**
 * Tarjeta de puesto de trabajo CPQ
 */

"use client";

import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EditPositionModal } from "@/components/cpq/EditPositionModal";
import { CostBreakdownModal } from "@/components/cpq/CostBreakdownModal";
import { formatCurrency, formatWeekdaysShort, getShiftType, getShiftLabel } from "@/components/cpq/utils";
import { cn } from "@/lib/utils";
import type { CpqPosition } from "@/types/cpq";
import { Copy, Moon, MoreVertical, RefreshCw, Sun, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface CpqPositionCardProps {
  quoteId: string;
  position: CpqPosition;
  onUpdated?: () => void;
  readOnly?: boolean;
  salePriceMonthlyForPosition?: number;
  clientHourlyRate?: number;
}

export function CpqPositionCard({
  quoteId,
  position,
  onUpdated,
  readOnly = false,
  salePriceMonthlyForPosition: _salePriceMonthlyForPosition = 0,
  clientHourlyRate: _clientHourlyRate = 0,
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
  const isNight = getShiftType(position.startTime) === "night";
  const ShiftIcon = isNight ? Moon : Sun;

  return (
    <Card className="overflow-hidden border border-muted/40">
      {/* Tier 1: Header */}
      <div className="p-3 sm:p-4">
        <div className="flex items-center justify-between gap-2">
          <div
            className={cn("flex-1 min-w-0", !readOnly && "cursor-pointer hover:text-primary transition-colors")}
            onClick={readOnly ? undefined : () => setOpenEdit(true)}
          >
            <div className="flex items-center gap-2">
              <ShiftIcon className={cn("h-4 w-4 shrink-0", isNight ? "text-indigo-400" : "text-yellow-400")} />
              <h3 className="text-sm font-semibold truncate">{title}</h3>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5 truncate">
              {puestoName} · {roleName} · {position.numGuards}x{position.numPuestos || 1} · {formatWeekdaysShort(position.weekdays)} · {getShiftLabel(position.startTime)} {position.startTime}-{position.endTime}
            </p>
          </div>
          {!readOnly && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="icon" variant="ghost" className="h-9 w-9 shrink-0">
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                <DropdownMenuItem onClick={() => setOpenEdit(true)}>
                  Editar
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleClone} disabled={loading}>
                  <Copy className="h-4 w-4 mr-2" />
                  Clonar
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleRecalculate} disabled={loading}>
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Recalcular
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setOpenBreakdown(true)}>
                  Ver desglose
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  onClick={handleDelete}
                  disabled={loading}
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Eliminar
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>

      {/* Tier 2: Metrics */}
      <div className="flex items-center gap-4 px-3 sm:px-4 pb-3 text-xs border-t border-border/30 pt-2.5">
        <div>
          <span className="text-muted-foreground">Empresa</span>
          <span className="font-mono font-semibold ml-1">{formatCurrency(Number(position.employerCost))}</span>
        </div>
        <div>
          <span className="text-muted-foreground">Líquido</span>
          <span className="font-mono font-semibold ml-1">{formatCurrency(Number(position.netSalary || 0))}</span>
        </div>
        <div className="ml-auto text-right">
          <span className="text-muted-foreground">Mensual</span>
          <span className="font-mono font-semibold text-primary ml-1">{formatCurrency(Number(position.monthlyPositionCost))}</span>
        </div>
      </div>

      {/* Hidden modals */}
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
    </Card>
  );
}
