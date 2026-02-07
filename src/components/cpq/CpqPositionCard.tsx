/**
 * Tarjeta de puesto de trabajo CPQ
 */

"use client";

import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { EditPositionModal } from "@/components/cpq/EditPositionModal";
import { CostBreakdownModal } from "@/components/cpq/CostBreakdownModal";
import { formatCurrency, sortWeekdays } from "@/components/cpq/utils";
import type { CpqPosition } from "@/types/cpq";
import { MoreVertical } from "lucide-react";

interface CpqPositionCardProps {
  quoteId: string;
  position: CpqPosition;
  onUpdated?: () => void;
}

export function CpqPositionCard({ quoteId, position, onUpdated }: CpqPositionCardProps) {
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
    if (!confirm("¿Eliminar este puesto?")) return;
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

  const daysLabel = sortWeekdays(position.weekdays || []).join(", ");
  const title = position.customName || position.puestoTrabajo?.name || "Puesto";
  const shiftHours = (() => {
    if (!position.startTime || !position.endTime) return null;
    const [startH, startM] = position.startTime.split(":").map(Number);
    const [endH, endM] = position.endTime.split(":").map(Number);
    if (Number.isNaN(startH) || Number.isNaN(startM) || Number.isNaN(endH) || Number.isNaN(endM)) {
      return null;
    }
    const startMinutes = startH * 60 + startM;
    let endMinutes = endH * 60 + endM;
    if (endMinutes <= startMinutes) endMinutes += 24 * 60;
    return (endMinutes - startMinutes) / 60;
  })();
  const healthLabel = position.healthSystem === "isapre" ? "Isapre" : "Fonasa";

  return (
    <Card className="overflow-hidden border border-muted/40">
      <div className="flex items-start justify-between gap-3 border-b bg-muted/20 p-3">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-foreground">{title}</h3>
            <Badge variant="outline" className="text-[10px]">
              {position.numGuards} guardias
            </Badge>
          </div>
          <p className="text-[11px] text-muted-foreground">
            {daysLabel || "Días por definir"} · {position.startTime} - {position.endTime}
            {" · "}
            {shiftHours === null
              ? "Jornada --"
              : `Jornada ${shiftHours % 1 === 0 ? shiftHours.toFixed(0) : shiftHours.toFixed(1)} h`}
            {" · "}
            {healthLabel}
          </p>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="icon" variant="ghost" className="h-8 w-8">
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => setOpenEdit(true)}>Editar</DropdownMenuItem>
            <DropdownMenuItem onClick={handleRecalculate} disabled={loading}>
              Recalcular costo
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handleDelete} disabled={loading}>
              Eliminar
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="grid gap-2 p-3 md:grid-cols-5">
        <div className="rounded-md bg-gradient-to-br from-blue-600/40 to-blue-800/30 p-2 text-white">
          <p className="text-[9px] uppercase text-white/70">Cargo</p>
          <p className="text-[11px] font-semibold">{position.cargo?.name || "—"}</p>
        </div>
        <div className="rounded-md bg-gradient-to-br from-purple-600/40 to-purple-800/30 p-2 text-white">
          <p className="text-[9px] uppercase text-white/70">Rol</p>
          <p className="text-[11px] font-semibold">{position.rol?.name || "—"}</p>
        </div>
        <div className="rounded-md bg-gradient-to-br from-indigo-600/40 to-indigo-800/30 p-2 text-white">
          <p className="text-[9px] uppercase text-white/70">Base c/u</p>
          <p className="text-[11px] font-semibold">{formatCurrency(Number(position.baseSalary))}</p>
        </div>
        <div className="rounded-md bg-gradient-to-br from-emerald-600/40 to-emerald-800/30 p-2 text-white">
          <p className="text-[9px] uppercase text-white/70">Líquido c/u</p>
          <p className="text-[11px] font-semibold">
            {formatCurrency(Number(position.netSalary || 0))}
          </p>
        </div>
        <div className="rounded-md bg-gradient-to-br from-cyan-600/40 to-cyan-800/30 p-2 text-white">
          <p className="text-[9px] uppercase text-white/70">Empresa c/u</p>
          <p className="text-[11px] font-semibold">
            {formatCurrency(Number(position.employerCost))}
          </p>
        </div>
      </div>

      <div className="flex items-center justify-between border-t bg-muted/10 px-3 py-2">
        <p className="text-[10px] text-muted-foreground">
          Total puesto ({position.numGuards}):{" "}
          <span className="font-mono text-foreground">
            {formatCurrency(Number(position.monthlyPositionCost))}
          </span>
        </p>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" className="h-7 px-2 text-[10px]" onClick={() => setOpenBreakdown(true)}>
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
