/**
 * Card de un servicio (grupo de turnos). Header con nombre editable + chips,
 * colapsable, lista de turnos (resumen colapsado / editor inline expandido).
 */
"use client";

import { useState, type ReactNode } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ChevronDown, Plus, Pencil, Check, X, Trash2, Copy, Palette } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { CpqDualCurrencyAmount } from "@/components/cpq/CpqDualCurrency";
import { ShiftRowSummary } from "./ShiftRowSummary";
import { ShiftRowEditor } from "./ShiftRowEditor";
import { resolveServiceColor, hexToRgba, SERVICE_COLOR_PALETTE } from "./service-colors";
import type { NormalizedGroup, NormalizedShift, PositionMatrixAdapter } from "./types";

type DeleteTarget = { kind: "row"; id: string } | { kind: "group" } | null;

interface Props {
  group: NormalizedGroup | null;
  rows: NormalizedShift[];
  adapter: PositionMatrixAdapter;
  totalCost: number;
  expandedRowId: string | null;
  onToggleRow: (id: string) => void;
  /** Manejador de arrastre (grip) inyectado por el contenedor sortable. */
  dragHandle?: ReactNode;
  /** Índice del servicio (para autoasignar color de la paleta). */
  colorIndex?: number;
}

export function ServiceCard({ group, rows, adapter, totalCost, expandedRowId, onToggleRow, dragHandle, colorIndex = 0 }: Props) {
  const [expanded, setExpanded] = useState(true);
  const [editingName, setEditingName] = useState(false);
  const [draftName, setDraftName] = useState(group?.name ?? "");
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget>(null);
  const readOnly = adapter.readOnly;
  const groupKey = group?.key ?? null;

  const confirmDelete = () => {
    if (!deleteTarget) return;
    if (deleteTarget.kind === "row") adapter.onDeleteRow(deleteTarget.id);
    else if (group) adapter.onDeleteGroup?.(group.key);
    setDeleteTarget(null);
  };

  const groupCost = rows.reduce((s, r) => s + (r.costo ?? 0), 0);
  const totalGuards = rows.reduce((s, r) => s + r.guardias * (r.nPuestos || 1), 0);
  const pct = totalCost > 0 ? Math.round((groupCost / totalCost) * 100) : 0;

  const saveName = () => {
    const name = draftName.trim();
    if (group && name && name !== group.name) adapter.onRenameGroup(group.key, name);
    setEditingName(false);
  };

  // Color del servicio: del usuario (colorHex) o autoasignado por índice.
  // "Sin agrupar" (group === null) usa un gris neutro.
  const color = group ? resolveServiceColor(group.colorHex, colorIndex) : "#94a3b8";

  return (
    <Card
      className="overflow-hidden border-border bg-card"
      style={{ borderLeftColor: color, borderLeftWidth: 4 }}
    >
      <div
        role="button"
        tabIndex={0}
        onClick={() => !editingName && setExpanded((v) => !v)}
        className="cursor-pointer border-b border-border px-3 py-2.5 transition-colors"
        style={{ backgroundColor: hexToRgba(color, 0.1) }}
      >
        {/* En sm+ es una sola fila; en móvil se parte en dos filas (nombre arriba, meta+acciones abajo). */}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-2">

          {/* FILA 1 (móvil) / inicio de fila (desktop): handle + dot + nombre + chevron */}
          <div className="flex min-w-0 flex-1 items-center gap-2">
            {dragHandle && !editingName && (
              <div onClick={(e) => e.stopPropagation()} className="shrink-0">
                {dragHandle}
              </div>
            )}
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: color }}
              aria-hidden
            />
            <div className="min-w-0 flex-1">
              {editingName && group ? (
                <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                  <Input
                    value={draftName}
                    onChange={(e) => setDraftName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") saveName();
                      if (e.key === "Escape") { setEditingName(false); setDraftName(group.name); }
                    }}
                    className="h-8 text-sm"
                    autoFocus
                  />
                  <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={saveName}>
                    <Check className="h-4 w-4" />
                  </Button>
                  <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={() => { setEditingName(false); setDraftName(group.name); }}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <>
                  {/* Nombre: en móvil hasta 2 líneas sin corte agresivo; en sm+ se trunca a 1 línea como antes. */}
                  <div className="text-sm font-semibold text-foreground line-clamp-2 sm:truncate">
                    {group?.name ?? "Sin agrupar"}
                  </div>
                  {/* Meta visible aquí SOLO en desktop (en móvil va en la fila 2). */}
                  <div className="mt-0.5 hidden flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground sm:flex">
                    <span>{rows.length} turno{rows.length !== 1 ? "s" : ""}</span>
                    <span>·</span>
                    <span>{totalGuards} guardia{totalGuards !== 1 ? "s" : ""}</span>
                    {pct > 0 && (<><span>·</span><span>{pct}% del total</span></>)}
                  </div>
                </>
              )}
            </div>

            {/* Chevron: en móvil queda al final de la fila 1; en sm+ se mueve al final de todo (ver más abajo). */}
            <ChevronDown className={cn("h-5 w-5 shrink-0 text-muted-foreground transition-transform sm:hidden", expanded && "rotate-180")} />
          </div>

          {/* FILA 2 (móvil) / cola de la fila (desktop): meta-móvil + monto + acciones + chevron-desktop */}
          {!editingName && (
            <div className="flex items-center justify-between gap-2 sm:justify-start sm:gap-2">

              {/* Meta SOLO móvil (en desktop ya se mostró junto al nombre). */}
              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground sm:hidden">
                <span>{rows.length} turno{rows.length !== 1 ? "s" : ""}</span>
                <span>·</span>
                <span>{totalGuards} guardia{totalGuards !== 1 ? "s" : ""}</span>
                {pct > 0 && (<><span>·</span><span>{pct}% del total</span></>)}
              </div>

              {groupCost > 0 && (
                <CpqDualCurrencyAmount
                  clp={groupCost}
                  currency={adapter.currency}
                  ufValue={adapter.ufValue}
                  size="sm"
                  inline
                  primaryClassName="font-semibold text-foreground"
                />
              )}

              {!readOnly && group && (
                <div className="flex shrink-0 gap-0.5" onClick={(e) => e.stopPropagation()}>
                  {adapter.onSetGroupColor && (
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button type="button" variant="ghost" size="icon" className="h-9 w-9 sm:h-8 sm:w-8" title="Color del servicio">
                          <Palette className="h-3.5 w-3.5" style={{ color }} />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-2" align="end">
                        <div className="grid grid-cols-6 gap-1.5">
                          {SERVICE_COLOR_PALETTE.map((c) => (
                            <button
                              key={c}
                              type="button"
                              onClick={() => adapter.onSetGroupColor?.(group.key, c)}
                              className={cn(
                                "h-6 w-6 rounded-full border transition-transform hover:scale-110",
                                color.toLowerCase() === c.toLowerCase() ? "border-foreground ring-2 ring-offset-1 ring-offset-background" : "border-border"
                              )}
                              style={{ backgroundColor: c }}
                              title={c}
                              aria-label={`Color ${c}`}
                            />
                          ))}
                        </div>
                      </PopoverContent>
                    </Popover>
                  )}
                  <Button type="button" variant="ghost" size="icon" className="h-9 w-9 sm:h-8 sm:w-8" onClick={() => { setDraftName(group.name); setEditingName(true); }} title="Renombrar">
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  {adapter.onCloneGroup && (
                    <Button type="button" variant="ghost" size="icon" className="h-9 w-9 sm:h-8 sm:w-8" onClick={() => adapter.onCloneGroup?.(group.key)} title="Duplicar servicio">
                      <Copy className="h-3.5 w-3.5" />
                    </Button>
                  )}
                  {adapter.onDeleteGroup && (
                    <Button type="button" variant="ghost" size="icon" className="h-9 w-9 text-destructive sm:h-8 sm:w-8" onClick={() => setDeleteTarget({ kind: "group" })} title="Eliminar servicio">
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              )}

              {/* Chevron SOLO desktop (en móvil ya se mostró en la fila 1). */}
              <ChevronDown className={cn("hidden h-4 w-4 shrink-0 text-muted-foreground transition-transform sm:block", expanded && "rotate-180")} />
            </div>
          )}
        </div>
      </div>

      {expanded && (
        <div className="space-y-2 p-2">
          {rows.length === 0 ? (
            <div className="rounded-md border border-dashed border-border p-3 text-center text-xs text-muted-foreground">
              Sin turnos. Agrega el primero abajo.
            </div>
          ) : (
            rows.map((row) => (
              <div key={row.id} className="space-y-2">
                <ShiftRowSummary
                  row={row}
                  puestos={adapter.catalogs.puestos}
                  currency={adapter.currency}
                  ufValue={adapter.ufValue}
                  expanded={expandedRowId === row.id}
                  saving={adapter.savingRowId === row.id}
                  onToggle={() => onToggleRow(row.id)}
                />
                {expandedRowId === row.id && !readOnly && (
                  <ShiftRowEditor
                    row={row}
                    catalogs={adapter.catalogs}
                    currency={adapter.currency}
                    ufValue={adapter.ufValue}
                    disableLivePreview={adapter.disableLivePreview}
                    onUpdate={(patch) => adapter.onUpdateRow(row.id, patch)}
                    onClone={() => adapter.onCloneRow(row.id)}
                    onDelete={() => setDeleteTarget({ kind: "row", id: row.id })}
                    onDone={() => onToggleRow(row.id)}
                  />
                )}
              </div>
            ))
          )}
          {!readOnly && (
            <Button type="button" variant="outline" size="sm" className="h-9 w-full gap-1 text-xs" onClick={() => adapter.onAddRow(groupKey)}>
              <Plus className="h-3.5 w-3.5" /> Agregar turno
            </Button>
          )}
        </div>
      )}

      <Dialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {deleteTarget?.kind === "group" ? "Eliminar servicio" : "Eliminar turno"}
            </DialogTitle>
            <DialogDescription>
              {deleteTarget?.kind === "group"
                ? `¿Eliminar el servicio "${group?.name ?? ""}"? Sus turnos quedarán sin agrupar.`
                : "¿Eliminar este turno? Esta acción no se puede deshacer."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={confirmDelete}>
              Eliminar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
