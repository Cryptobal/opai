/**
 * Vista grilla (tipo Excel) de la matriz de puestos: servicios en bandas de
 * color con sus turnos en filas y columnas editables inline. Comparte el mismo
 * adapter que la vista de tarjetas, así ambas quedan siempre sincronizadas.
 */
"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode, type Ref } from "react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Plus,
  Copy,
  Trash2,
  Pencil,
  Check,
  X,
  Palette,
  Moon,
  Sun,
  Loader2,
  GripVertical,
  ArrowLeftRight,
} from "lucide-react";
import { cn, formatNumber, parseLocalizedNumber } from "@/lib/utils";
import { CpqDualCurrencyAmount } from "@/components/cpq/CpqDualCurrency";
import { HOURS_24, WEEKDAY_ORDER, isNightShift } from "./shift-utils";
import { resolveServiceColor, hexToRgba, SERVICE_COLOR_PALETTE } from "./service-colors";
import type { NormalizedGroup, NormalizedShift, PositionMatrixAdapter, ShiftPatch } from "./types";

const FIELD =
  "flex h-9 w-full rounded-md border border-border bg-card px-1.5 text-[13px] text-foreground";

interface Props {
  adapter: PositionMatrixAdapter;
}

type DeleteTarget =
  | { kind: "row"; id: string }
  | { kind: "group"; key: string; name: string }
  | null;

export function PositionMatrixGrid({ adapter }: Props) {
  const readOnly = adapter.readOnly;
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget>(null);

  const { byGroup, ungrouped } = useMemo(() => {
    const map = new Map<string, NormalizedShift[]>();
    const un: NormalizedShift[] = [];
    for (const r of adapter.rows) {
      if (!r.groupKey) {
        un.push(r);
        continue;
      }
      const list = map.get(r.groupKey) ?? [];
      list.push(r);
      map.set(r.groupKey, list);
    }
    return { byGroup: map, ungrouped: un };
  }, [adapter.rows]);

  const totalCost = useMemo(
    () => adapter.rows.reduce((s, r) => s + (r.costo ?? 0), 0),
    [adapter.rows]
  );

  const sortedGroups = useMemo(
    () => [...adapter.groups].sort((a, b) => a.order - b.order || a.name.localeCompare(b.name)),
    [adapter.groups]
  );

  // Orden local optimista para el drag & drop (se re-sincroniza con el adapter).
  const [orderedKeys, setOrderedKeys] = useState<string[]>(() => sortedGroups.map((g) => g.key));
  const sortedKeysSignature = sortedGroups.map((g) => g.key).join("|");
  useEffect(() => {
    setOrderedKeys(sortedGroups.map((g) => g.key));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sortedKeysSignature]);

  const groupByKey = useMemo(() => {
    const m = new Map<string, NormalizedGroup>();
    for (const g of sortedGroups) m.set(g.key, g);
    return m;
  }, [sortedGroups]);

  const orderedGroups = useMemo(
    () => orderedKeys.map((k) => groupByKey.get(k)).filter((g): g is NormalizedGroup => !!g),
    [orderedKeys, groupByKey]
  );

  const dndEnabled = !readOnly && !!adapter.onReorderGroups && orderedGroups.length > 1;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor),
  );

  const handleGroupDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = orderedKeys.indexOf(String(active.id));
    const newIndex = orderedKeys.indexOf(String(over.id));
    if (oldIndex === -1 || newIndex === -1) return;
    const next = arrayMove(orderedKeys, oldIndex, newIndex);
    setOrderedKeys(next);
    adapter.onReorderGroups?.(next);
  };

  const confirmDelete = () => {
    if (!deleteTarget) return;
    if (deleteTarget.kind === "row") adapter.onDeleteRow(deleteTarget.id);
    else adapter.onDeleteGroup?.(deleteTarget.key);
    setDeleteTarget(null);
  };

  const COLS = 12;

  const groupBlocks = orderedGroups.map((group, gi) => (
    <SortableGroupBlock
      key={group.key}
      group={group}
      colorIndex={gi}
      rows={byGroup.get(group.key) ?? []}
      adapter={adapter}
      totalCost={totalCost}
      cols={COLS}
      readOnly={readOnly}
      sortable={dndEnabled}
      onRequestDeleteGroup={() => setDeleteTarget({ kind: "group", key: group.key, name: group.name })}
      onRequestDeleteRow={(id) => setDeleteTarget({ kind: "row", id })}
    />
  ));

  const ungroupedBlock = ungrouped.length > 0 && (
    <GroupBlock
      group={null}
      colorIndex={0}
      rows={ungrouped}
      adapter={adapter}
      totalCost={totalCost}
      cols={COLS}
      readOnly={readOnly}
      onRequestDeleteGroup={() => {}}
      onRequestDeleteRow={(id) => setDeleteTarget({ kind: "row", id })}
    />
  );

  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full min-w-[980px] border-collapse text-left">
        <thead>
          <tr className="border-b border-border bg-muted/30 text-xs uppercase tracking-wide text-muted-foreground">
            <th className="px-2 py-2 font-medium">Turno</th>
            <th className="px-2 py-2 font-medium">Puesto</th>
            <th className="px-2 py-2 font-medium">Cargo</th>
            <th className="px-2 py-2 font-medium">Rol</th>
            <th className="px-2 py-2 font-medium">Horario</th>
            <th className="px-2 py-2 font-medium">Días</th>
            <th className="px-2 py-2 text-center font-medium">Guard.</th>
            <th className="px-2 py-2 text-center font-medium">Ptos</th>
            <th className="px-2 py-2 text-right font-medium">Bruto</th>
            <th className="px-2 py-2 text-right font-medium">Líquido</th>
            <th className="px-2 py-2 text-right font-medium">Costo/mes</th>
            <th className="px-2 py-2" />
          </tr>
        </thead>
        {dndEnabled ? (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleGroupDragEnd}>
            <SortableContext items={orderedKeys} strategy={verticalListSortingStrategy}>
              <tbody>
                {groupBlocks}
                {ungroupedBlock}
              </tbody>
            </SortableContext>
          </DndContext>
        ) : (
          <tbody>
            {groupBlocks}
            {ungroupedBlock}
          </tbody>
        )}
      </table>

      <Dialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {deleteTarget?.kind === "group" ? "Eliminar servicio" : "Eliminar turno"}
            </DialogTitle>
            <DialogDescription>
              {deleteTarget?.kind === "group"
                ? `¿Eliminar el servicio "${deleteTarget.name}"? Sus turnos quedarán sin agrupar.`
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
    </div>
  );
}

interface GroupBlockProps {
  group: NormalizedGroup | null;
  colorIndex: number;
  rows: NormalizedShift[];
  adapter: PositionMatrixAdapter;
  totalCost: number;
  cols: number;
  readOnly?: boolean;
  onRequestDeleteGroup: () => void;
  onRequestDeleteRow: (id: string) => void;
  /** Ref del <tr> de la banda (para dnd-kit sortable). */
  bandRef?: Ref<HTMLTableRowElement>;
  /** Estilo extra para la banda (transform/transition del drag). */
  bandStyle?: CSSProperties;
  /** Manejador de arrastre inyectado por el contenedor sortable. */
  dragHandle?: ReactNode;
}

function SortableGroupBlock({
  sortable,
  group,
  ...rest
}: Omit<GroupBlockProps, "group" | "bandRef" | "bandStyle" | "dragHandle"> & {
  group: NormalizedGroup;
  sortable: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: group.key,
    disabled: !sortable,
  });
  const bandStyle: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.7 : undefined,
    position: "relative",
    zIndex: isDragging ? 30 : undefined,
  };
  const handle = sortable ? (
    <button
      type="button"
      className="cursor-grab touch-none p-0.5 text-muted-foreground/40 transition-colors hover:text-muted-foreground active:cursor-grabbing"
      aria-label="Arrastrar para reordenar servicio"
      {...attributes}
      {...listeners}
    >
      <GripVertical className="h-4 w-4" />
    </button>
  ) : undefined;
  return <GroupBlock group={group} {...rest} bandRef={setNodeRef} bandStyle={bandStyle} dragHandle={handle} />;
}

function GroupBlock({
  group,
  colorIndex,
  rows,
  adapter,
  totalCost,
  cols,
  readOnly,
  onRequestDeleteGroup,
  onRequestDeleteRow,
  bandRef,
  bandStyle,
  dragHandle,
}: GroupBlockProps) {
  const color = group ? resolveServiceColor(group.colorHex, colorIndex) : "#94a3b8";
  const [editingName, setEditingName] = useState(false);
  const [draftName, setDraftName] = useState(group?.name ?? "");

  const groupCost = rows.reduce((s, r) => s + (r.costo ?? 0), 0);
  const totalGuards = rows.reduce((s, r) => s + r.guardias * (r.nPuestos || 1), 0);
  const pct = totalCost > 0 ? Math.round((groupCost / totalCost) * 100) : 0;
  const groupKey = group?.key ?? null;

  const saveName = () => {
    const name = draftName.trim();
    if (group && name && name !== group.name) adapter.onRenameGroup(group.key, name);
    setEditingName(false);
  };

  return (
    <>
      {/* Banda de servicio */}
      <tr ref={bandRef} style={{ backgroundColor: hexToRgba(color, 0.12), ...bandStyle }}>
        <td colSpan={cols} className="border-y border-border p-0">
          <div className="flex items-center gap-2 px-2 py-1.5" style={{ borderLeft: `4px solid ${color}` }}>
            {dragHandle && <span className="shrink-0">{dragHandle}</span>}
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: color }} aria-hidden />
            {editingName && group ? (
              <div className="flex items-center gap-1">
                <Input
                  value={draftName}
                  onChange={(e) => setDraftName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") saveName();
                    if (e.key === "Escape") { setEditingName(false); setDraftName(group.name); }
                  }}
                  className="h-7 w-56 text-[13px]"
                  autoFocus
                />
                <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={saveName}>
                  <Check className="h-3.5 w-3.5" />
                </Button>
                <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setEditingName(false); setDraftName(group.name); }}>
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            ) : (
              <span className="text-[13px] font-semibold text-foreground">
                {group?.name ?? "Sin agrupar"}
              </span>
            )}
            <span className="text-xs text-muted-foreground">
              {rows.length} turno{rows.length !== 1 ? "s" : ""} · {totalGuards} guardia{totalGuards !== 1 ? "s" : ""}
              {pct > 0 ? ` · ${pct}%` : ""}
            </span>

            <div className="ml-auto flex items-center gap-2">
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
              {!readOnly && group && !editingName && (
                <div className="flex shrink-0 items-center gap-0.5">
                  {adapter.onSetGroupColor && (
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button type="button" variant="ghost" size="icon" className="h-7 w-7" title="Color del servicio">
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
                                color.toLowerCase() === c.toLowerCase()
                                  ? "border-foreground ring-2 ring-offset-1 ring-offset-background"
                                  : "border-border"
                              )}
                              style={{ backgroundColor: c }}
                              aria-label={`Color ${c}`}
                            />
                          ))}
                        </div>
                      </PopoverContent>
                    </Popover>
                  )}
                  <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setDraftName(group.name); setEditingName(true); }} title="Renombrar">
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  {adapter.onCloneGroup && (
                    <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => adapter.onCloneGroup?.(group.key)} title="Duplicar servicio">
                      <Copy className="h-3.5 w-3.5" />
                    </Button>
                  )}
                  {adapter.onDeleteGroup && (
                    <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={onRequestDeleteGroup} title="Eliminar servicio">
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              )}
            </div>
          </div>
        </td>
      </tr>

      {rows.map((row) => (
        <GridRow
          key={row.id}
          row={row}
          adapter={adapter}
          readOnly={readOnly}
          onRequestDelete={() => onRequestDeleteRow(row.id)}
        />
      ))}

      {!readOnly && (
        <tr>
          <td colSpan={cols} className="border-b border-border bg-card px-2 py-1">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 gap-1 text-xs text-muted-foreground"
              onClick={() => adapter.onAddRow(groupKey)}
            >
              <Plus className="h-3.5 w-3.5" /> Agregar turno
            </Button>
          </td>
        </tr>
      )}
    </>
  );
}

interface GridRowProps {
  row: NormalizedShift;
  adapter: PositionMatrixAdapter;
  readOnly?: boolean;
  onRequestDelete: () => void;
}

type RowDraft = Pick<
  NormalizedShift,
  "puestoId" | "cargoId" | "rolId" | "inicio" | "fin" | "dias" | "guardias" | "nPuestos" | "bruto"
>;

function rowDraftOf(row: NormalizedShift): RowDraft {
  return {
    puestoId: row.puestoId,
    cargoId: row.cargoId,
    rolId: row.rolId,
    inicio: row.inicio,
    fin: row.fin,
    dias: row.dias,
    guardias: row.guardias,
    nPuestos: row.nPuestos || 1,
    bruto: row.bruto,
  };
}

function GridRow({ row, adapter, readOnly, onRequestDelete }: GridRowProps) {
  const { catalogs, currency, ufValue, savingRowId } = adapter;
  const [draft, setDraft] = useState<RowDraft>(() => rowDraftOf(row));
  const ref = useRef(draft);
  ref.current = draft;

  // Re-sincroniza desde props cuando el servidor refresca (clone, plantilla,
  // normalización). La firma evita pisar ediciones en curso ya reflejadas.
  const propSig = JSON.stringify(rowDraftOf(row));
  const lastSig = useRef(propSig);
  useEffect(() => {
    if (propSig !== lastSig.current) {
      lastSig.current = propSig;
      setDraft(rowDraftOf(row));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [propSig]);

  const apply = (patch: Partial<RowDraft>) => {
    let next = { ...ref.current, ...patch };
    if (patch.rolId !== undefined) {
      const rolSalary = catalogs.roles.find((r) => r.id === next.rolId)?.salary;
      if (rolSalary != null && rolSalary > 0) next = { ...next, bruto: rolSalary };
    }
    setDraft(next);
    lastSig.current = JSON.stringify(next);
    adapter.onUpdateRow(row.id, next as ShiftPatch);
  };

  const toggleDay = (d: string) => {
    const has = ref.current.dias.includes(d);
    const next = has ? ref.current.dias.filter((x) => x !== d) : [...ref.current.dias, d];
    if (!next.length) return;
    apply({ dias: next });
  };

  const night = isNightShift(draft.inicio);
  const saving = savingRowId === row.id;
  const cellSelect = readOnly;

  return (
    <tr className="border-b border-border/60 hover:bg-muted/20">
      {/* Tipo */}
      <td className="px-2 py-1">
        <span
          className={cn(
            "inline-flex h-6 items-center gap-1 rounded-md border px-1.5 text-xs font-semibold",
            night
              ? "border-tint-violet-fg/30 bg-tint-violet text-tint-violet-fg"
              : "border-status-warn-border bg-status-warn-soft text-status-warn-fg"
          )}
        >
          {night ? <Moon className="h-3 w-3" /> : <Sun className="h-3 w-3" />}
          {night ? "Noche" : "Día"}
        </span>
      </td>

      {/* Puesto */}
      <td className="px-2 py-1">
        <select
          className={cn(FIELD, "min-w-[130px]")}
          value={draft.puestoId}
          disabled={cellSelect}
          onChange={(e) => apply({ puestoId: e.target.value })}
        >
          <option value="">—</option>
          {catalogs.puestos.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
      </td>

      {/* Cargo */}
      <td className="px-2 py-1">
        <select
          className={cn(FIELD, "min-w-[110px]")}
          value={draft.cargoId}
          disabled={cellSelect}
          onChange={(e) => apply({ cargoId: e.target.value })}
        >
          <option value="">—</option>
          {catalogs.cargos.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </td>

      {/* Rol */}
      <td className="px-2 py-1">
        <select
          className={cn(FIELD, "min-w-[100px]")}
          value={draft.rolId}
          disabled={cellSelect}
          onChange={(e) => apply({ rolId: e.target.value })}
        >
          <option value="">—</option>
          {catalogs.roles.map((r) => (
            <option key={r.id} value={r.id}>{r.name}</option>
          ))}
        </select>
      </td>

      {/* Horario */}
      <td className="px-2 py-1">
        <div className="flex items-center gap-1">
          <select
            className={cn(FIELD, "w-[74px] font-mono")}
            value={draft.inicio}
            disabled={cellSelect}
            onChange={(e) => apply({ inicio: e.target.value })}
          >
            {HOURS_24.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <span className="text-muted-foreground">–</span>
          <select
            className={cn(FIELD, "w-[74px] font-mono")}
            value={draft.fin}
            disabled={cellSelect}
            onChange={(e) => apply({ fin: e.target.value })}
          >
            {HOURS_24.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          {!cellSelect && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7 shrink-0"
              title="Invertir horario (día ↔ noche)"
              onClick={() => apply({ inicio: ref.current.fin, fin: ref.current.inicio })}
            >
              <ArrowLeftRight className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </td>

      {/* Días */}
      <td className="px-2 py-1">
        <div className="flex gap-0.5">
          {WEEKDAY_ORDER.map((d) => {
            const on = draft.dias.includes(d);
            return (
              <button
                key={d}
                type="button"
                disabled={cellSelect}
                onClick={() => toggleDay(d)}
                className={cn(
                  "h-7 w-6 rounded border text-[11px] font-semibold transition-colors",
                  on
                    ? "border-primary/40 bg-primary/15 text-primary"
                    : "border-border bg-card text-muted-foreground hover:bg-muted/40"
                )}
                title={d}
              >
                {d.charAt(0)}
              </button>
            );
          })}
        </div>
      </td>

      {/* Guardias */}
      <td className="px-2 py-1 text-center">
        <select
          className={cn(FIELD, "w-[54px] justify-center text-center")}
          value={draft.guardias}
          disabled={cellSelect}
          onChange={(e) => apply({ guardias: Number(e.target.value) })}
        >
          {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
      </td>

      {/* N° Puestos */}
      <td className="px-2 py-1 text-center">
        <select
          className={cn(FIELD, "w-[54px] justify-center text-center")}
          value={draft.nPuestos}
          disabled={cellSelect}
          onChange={(e) => apply({ nPuestos: Number(e.target.value) })}
        >
          {Array.from({ length: 20 }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
      </td>

      {/* Bruto */}
      <td className="px-2 py-1 text-right">
        <Input
          type="text"
          inputMode="numeric"
          disabled={cellSelect}
          value={formatNumber(draft.bruto, { minDecimals: 0, maxDecimals: 0 })}
          onChange={(e) => apply({ bruto: parseLocalizedNumber(e.target.value) || 0 })}
          className="h-9 w-[110px] text-right font-mono text-[13px]"
        />
      </td>

      {/* Líquido (read-only) */}
      <td className="px-2 py-1 text-right font-mono text-[13px] text-muted-foreground">
        {row.liquido != null && row.liquido > 0 ? Math.round(row.liquido).toLocaleString("es-CL") : "—"}
      </td>

      {/* Costo/mes (read-only) */}
      <td className="px-2 py-1 text-right">
        <CpqDualCurrencyAmount
          clp={row.costo ?? 0}
          currency={currency}
          ufValue={ufValue}
          size="sm"
          primaryClassName="font-semibold text-foreground"
          align="right"
        />
      </td>

      {/* Acciones */}
      <td className="px-2 py-1">
        <div className="flex items-center justify-end gap-0.5">
          {saving && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
          {!readOnly && (
            <>
              <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => adapter.onCloneRow(row.id)} title="Duplicar turno">
                <Copy className="h-3.5 w-3.5" />
              </Button>
              <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={onRequestDelete} title="Eliminar turno">
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </>
          )}
        </div>
      </td>
    </tr>
  );
}
