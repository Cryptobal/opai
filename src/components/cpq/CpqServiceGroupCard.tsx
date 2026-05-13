"use client";

import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  ChevronDown,
  Plus,
  Trash2,
  Pencil,
  Check,
  X,
  ShieldCheck,
  Sun,
  Moon,
  Calendar,
  CalendarClock,
  Settings2,
} from "lucide-react";
import { CpqDualCurrencyAmount } from "@/components/cpq/CpqDualCurrency";
import { CpqShiftCompactCard } from "@/components/cpq/CpqShiftCompactCard";
import { getCoveragePatternMeta } from "@/lib/cpq/coverage-patterns";
import { cn } from "@/lib/utils";
import type { CpqPosition, CpqServiceGroup } from "@/types/cpq";
import { toast } from "sonner";

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  ShieldCheck,
  Sun,
  Moon,
  Calendar,
  CalendarClock,
  Settings2,
};

interface Props {
  quoteId: string;
  group: CpqServiceGroup;
  shifts: CpqPosition[];
  onRefresh: () => void;
  readOnly?: boolean;
  displayCurrency?: string;
  ufValue?: number | null;
  onAddShift: (groupId: string) => void;
}

export function CpqServiceGroupCard({
  quoteId,
  group,
  shifts,
  onRefresh,
  readOnly,
  displayCurrency = "CLP",
  ufValue,
  onAddShift,
}: Props) {
  const [expanded, setExpanded] = useState(true);
  const [editingName, setEditingName] = useState(false);
  const [draftName, setDraftName] = useState(group.name);
  const meta = getCoveragePatternMeta(group.coveragePattern);
  const Icon = ICONS[group.iconName || meta.icon] || ShieldCheck;
  const totalGuards = shifts.reduce((s, p) => s + p.numGuards * (p.numPuestos || 1), 0);
  const totalCost = shifts.reduce((s, p) => s + Number(p.monthlyPositionCost), 0);
  const accent = group.colorHex || undefined;

  const saveName = async () => {
    const name = draftName.trim();
    if (!name || name === group.name) {
      setEditingName(false);
      setDraftName(group.name);
      return;
    }
    try {
      const r = await fetch(`/api/cpq/quotes/${quoteId}/services/${group.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const d = await r.json();
      if (!d.success) throw new Error(d.error);
      setEditingName(false);
      onRefresh();
    } catch {
      toast.error("No se pudo renombrar");
    }
  };

  const remove = async () => {
    const cascade = confirm(
      `¿Eliminar el servicio "${group.name}" y sus ${shifts.length} turno(s)?\n\nAceptar = elimina todo\nCancelar = mantiene los turnos como "Sin agrupar"`
    );
    try {
      const url = cascade
        ? `/api/cpq/quotes/${quoteId}/services/${group.id}?cascade=true`
        : `/api/cpq/quotes/${quoteId}/services/${group.id}`;
      const r = await fetch(url, { method: "DELETE" });
      const d = await r.json();
      if (!d.success) throw new Error(d.error);
      toast.success(cascade ? "Servicio y turnos eliminados" : "Servicio eliminado");
      onRefresh();
    } catch {
      toast.error("No se pudo eliminar");
    }
  };

  return (
    <Card
      className="overflow-hidden border-l-4 shadow-sm"
      style={accent ? { borderLeftColor: accent } : undefined}
    >
      <div
        className={cn(
          "flex items-center gap-2 px-3 py-2.5 transition-colors cursor-pointer",
          "border-b border-border/40 bg-muted/15 hover:bg-muted/25"
        )}
        onClick={() => !editingName && setExpanded((v) => !v)}
      >
        <Icon className="h-4 w-4 shrink-0 text-primary" />
        <div className="min-w-0 flex-1">
          {editingName ? (
            <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
              <Input
                value={draftName}
                onChange={(e) => setDraftName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") saveName();
                  if (e.key === "Escape") {
                    setEditingName(false);
                    setDraftName(group.name);
                  }
                }}
                className="h-7 text-sm"
                autoFocus
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={saveName}
              >
                <Check className="h-3.5 w-3.5" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => {
                  setEditingName(false);
                  setDraftName(group.name);
                }}
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-sm font-semibold text-foreground truncate">{group.name}</span>
              <Badge
                variant="outline"
                className="h-5 rounded px-1.5 text-[10px] font-semibold shrink-0"
              >
                {meta.shortLabel}
              </Badge>
            </div>
          )}
          <div className="mt-0.5 flex items-center gap-2 text-[11px] text-muted-foreground">
            <span>
              {shifts.length} turno{shifts.length !== 1 ? "s" : ""}
            </span>
            <span>·</span>
            <span>
              {totalGuards} guardia{totalGuards !== 1 ? "s" : ""}
            </span>
            {totalCost > 0 && (
              <>
                <span>·</span>
                <CpqDualCurrencyAmount
                  clp={totalCost}
                  currency={displayCurrency}
                  ufValue={ufValue}
                  size="xs"
                  inline
                  primaryClassName="font-medium text-foreground"
                />
              </>
            )}
          </div>
        </div>
        {!readOnly && !editingName && (
          <div className="flex gap-0.5 shrink-0" onClick={(e) => e.stopPropagation()}>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => setEditingName(true)}
              title="Renombrar"
            >
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-destructive"
              onClick={remove}
              title="Eliminar servicio"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}
        <ChevronDown
          className={cn(
            "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
            expanded && "rotate-180"
          )}
        />
      </div>

      {expanded && (
        <div className="p-2 space-y-2 bg-card/40">
          {shifts.length === 0 ? (
            <div className="rounded-md border border-dashed border-border/50 p-3 text-center text-xs text-muted-foreground">
              Sin turnos. Agrega el primero con el botón de abajo.
            </div>
          ) : (
            shifts.map((s) => (
              <CpqShiftCompactCard
                key={s.id}
                quoteId={quoteId}
                position={s}
                onUpdated={onRefresh}
                readOnly={readOnly}
                displayCurrency={displayCurrency}
                ufValue={ufValue}
              />
            ))
          )}
          {!readOnly && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 w-full text-xs gap-1"
              onClick={() => onAddShift(group.id)}
            >
              <Plus className="h-3 w-3" /> Agregar turno a este servicio
            </Button>
          )}
        </div>
      )}
    </Card>
  );
}
