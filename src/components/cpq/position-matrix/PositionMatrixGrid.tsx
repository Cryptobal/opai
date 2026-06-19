/**
 * Vista grilla (tipo Excel) de la matriz de puestos.
 *
 * - Servicio = primera columna con celda combinada (rowspan) y color.
 * - Turno = nombre editable (customName) con chip Día/Noche.
 * - Columnas alineadas con <colgroup> de anchos fijos + header sticky.
 * - Guardias / Ptos con stepper compacto.
 * - Subtotal por servicio + fila TOTAL general (tfoot).
 * - Reordenar servicios arrastrando (grip en la celda de servicio) con DragOverlay.
 *
 * Comparte el mismo adapter que la vista de tarjetas → ambas siempre sincronizadas.
 */
"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type Ref,
} from "react";
import {
  DndContext,
  DragOverlay,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
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
  Minus,
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
  ChevronDown,
  ChevronRight,
  RotateCcw,
} from "lucide-react";
import { cn, formatNumber, parseLocalizedNumber } from "@/lib/utils";
import { CpqDualCurrencyAmount } from "@/components/cpq/CpqDualCurrency";
import { HOURS_24, WEEKDAY_ORDER, isNightShift } from "./shift-utils";
import { resolveServiceColor, SERVICE_COLOR_PALETTE } from "./service-colors";
import { CatalogPicker } from "./CatalogPicker";
import { useGridColWidths, type GridColKey } from "./useGridColWidths";
import type { NormalizedGroup, NormalizedShift, PositionMatrixAdapter, ShiftPatch } from "./types";

const FIELD =
  "flex h-9 w-full rounded-md border border-border bg-card px-1.5 text-[13px] text-foreground";

/** Columnas no-servicio (9). El servicio es una celda rowspan aparte. */
const REST_COLS = 9;

/** Total de columnas de la tabla (servicio + 9). Usado por filas full-width. */
const TOTAL_COLS = REST_COLS + 1; // 10

const COLLAPSE_STORAGE_KEY = "cpq-grid-collapsed";

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
  const [activeId, setActiveId] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const { widths: colW, reset: resetColWidths, onResizeStart, autoFitCol } = useGridColWidths();

  useEffect(() => {
    try {
      const saved = localStorage.getItem(COLLAPSE_STORAGE_KEY);
      if (saved) setCollapsed(JSON.parse(saved) as Record<string, boolean>);
    } catch {
      /* noop */
    }
  }, []);

  const toggleCollapse = (key: string) =>
    setCollapsed((p) => {
      const next = { ...p, [key]: !p[key] };
      try {
        localStorage.setItem(COLLAPSE_STORAGE_KEY, JSON.stringify(next));
      } catch {
        /* noop */
      }
      return next;
    });

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
  const totalGuards = useMemo(
    () => adapter.rows.reduce((s, r) => s + r.guardias * (r.nPuestos || 1), 0),
    [adapter.rows]
  );
  const totalPtos = useMemo(
    () => adapter.rows.reduce((s, r) => s + (r.nPuestos || 1), 0),
    [adapter.rows]
  );

  const sortedGroups = useMemo(
    () => [...adapter.groups].sort((a, b) => a.order - b.order || a.name.localeCompare(b.name)),
    [adapter.groups]
  );

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
  const colorByKey = useMemo(() => {
    const m = new Map<string, string>();
    orderedGroups.forEach((g, i) => m.set(g.key, resolveServiceColor(g.colorHex, i)));
    return m;
  }, [orderedGroups]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor),
  );

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveId(null);
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

  const activeGroup = activeId ? groupByKey.get(activeId) : null;

  // Modelo tipo Google Sheets: cada columna tiene su ancho propio y es
  // redimensionable de forma independiente (incluida "Servicio"). El ancho de
  // la tabla = suma de columnas; al ensanchar una columna, las demás mantienen
  // su ancho y la tabla crece (aparece scroll horizontal si se sale de pantalla).
  // Doble clic en el separador autoajusta esa columna a su ancho por defecto.
  const totalWidth = Object.values(colW).reduce((s, w) => s + w, 0);

  const body = (
    <table className="table-fixed border-collapse text-left" style={{ width: totalWidth }}>
      <colgroup>
        <col data-colkey="servicio" style={{ width: colW.servicio }} />{/* Servicio */}
        <col data-colkey="puesto"   style={{ width: colW.puesto }} />{/* Puesto */}
        <col data-colkey="cargo"    style={{ width: colW.cargo }} />{/* Cargo */}
        <col data-colkey="rol"      style={{ width: colW.rol }} />{/* Rol */}
        <col data-colkey="horario"  style={{ width: colW.horario }} />{/* Horario (incluye chip Día/Noche) */}
        <col data-colkey="dias"     style={{ width: colW.dias }} />{/* Días */}
        <col data-colkey="guardias" style={{ width: colW.guardias }} />{/* Guardias */}
        <col data-colkey="ptos"     style={{ width: colW.ptos }} />{/* Ptos */}
        <col data-colkey="costo"    style={{ width: colW.costo }} />{/* Bruto · Líquido · Mano obra */}
        <col data-colkey="acciones" style={{ width: colW.acciones }} />{/* Acciones */}
      </colgroup>
      <thead className="sticky top-0 z-10">
        <tr className="border-b border-border bg-muted text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          <th className="relative border-r border-border px-2 py-2">
            Servicio
            <ResizeGrip colKey="servicio" onResizeStart={onResizeStart} onAutoFit={autoFitCol} />
          </th>
          <th className="relative border-r border-border px-2 py-2">
            Puesto
            <ResizeGrip colKey="puesto" onResizeStart={onResizeStart} onAutoFit={autoFitCol} />
          </th>
          <th className="relative border-r border-border px-2 py-2">
            Cargo
            <ResizeGrip colKey="cargo" onResizeStart={onResizeStart} onAutoFit={autoFitCol} />
          </th>
          <th className="relative border-r border-border px-2 py-2">
            Rol
            <ResizeGrip colKey="rol" onResizeStart={onResizeStart} onAutoFit={autoFitCol} />
          </th>
          <th className="relative border-r border-border px-2 py-2">
            Horario
            <ResizeGrip colKey="horario" onResizeStart={onResizeStart} onAutoFit={autoFitCol} />
          </th>
          <th className="relative border-r border-border px-2 py-2">
            Días
            <ResizeGrip colKey="dias" onResizeStart={onResizeStart} onAutoFit={autoFitCol} />
          </th>
          <th className="relative border-r border-border px-2 py-2 text-center">
            Guard.
            <ResizeGrip colKey="guardias" onResizeStart={onResizeStart} onAutoFit={autoFitCol} />
          </th>
          <th className="relative border-r border-border px-2 py-2 text-center">
            Ptos
            <ResizeGrip colKey="ptos" onResizeStart={onResizeStart} onAutoFit={autoFitCol} />
          </th>
          <th className="relative border-r border-border px-2 py-2 text-right">
            Bruto · Líquido
            <ResizeGrip colKey="costo" onResizeStart={onResizeStart} onAutoFit={autoFitCol} />
          </th>
          <th className="border-r border-border px-1 py-2" />
        </tr>
      </thead>
      <tbody>
        {orderedGroups.map((group, gi) => (
          <GroupBlock
            key={group.key}
            group={group}
            color={colorByKey.get(group.key) ?? resolveServiceColor(group.colorHex, gi)}
            rows={byGroup.get(group.key) ?? []}
            adapter={adapter}
            readOnly={readOnly}
            sortable={dndEnabled}
            dragging={activeId === group.key}
            collapsed={!!collapsed[group.key]}
            onToggleCollapse={() => toggleCollapse(group.key)}
            onRequestDeleteGroup={() => setDeleteTarget({ kind: "group", key: group.key, name: group.name })}
            onRequestDeleteRow={(id) => setDeleteTarget({ kind: "row", id })}
          />
        ))}

        {ungrouped.length > 0 && (
          <GroupBlock
            group={null}
            color="#94a3b8"
            rows={ungrouped}
            adapter={adapter}
            readOnly={readOnly}
            sortable={false}
            dragging={false}
            collapsed={false}
            onToggleCollapse={() => {}}
            onRequestDeleteGroup={() => {}}
            onRequestDeleteRow={(id) => setDeleteTarget({ kind: "row", id })}
          />
        )}
      </tbody>
      <tfoot>
        <tr className="border-t-2 border-border bg-muted/40 font-semibold">
          <td className="border-r border-border px-2 py-2 text-[13px] text-foreground" colSpan={6}>
            TOTAL
          </td>
          <td className="border-r border-border px-2 py-2 text-center text-[13px] text-foreground">{totalGuards}</td>
          <td className="border-r border-border px-2 py-2 text-center text-[13px] text-foreground">{totalPtos}</td>
          <td className="border-r border-border px-2 py-2 text-right">
            <CpqDualCurrencyAmount
              clp={totalCost}
              currency={adapter.currency}
              ufValue={adapter.ufValue}
              size="sm"
              primaryClassName="font-bold text-foreground"
              align="right"
            />
          </td>
          <td className="border-r border-border px-1 py-2" />
        </tr>
      </tfoot>
    </table>
  );

  return (
    <div>
      <div className="mb-2 flex justify-end">
        <Button type="button" variant="ghost" size="sm" className="h-7 gap-1 text-[11px] text-muted-foreground" onClick={resetColWidths}>
          <RotateCcw className="h-3 w-3" /> Restablecer columnas
        </Button>
      </div>
      <div className="overflow-x-auto rounded-lg border border-border">
      {dndEnabled ? (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={(e: DragStartEvent) => setActiveId(String(e.active.id))}
          onDragEnd={handleDragEnd}
          onDragCancel={() => setActiveId(null)}
        >
          <SortableContext items={orderedKeys} strategy={verticalListSortingStrategy}>
            {body}
          </SortableContext>
          <DragOverlay>
            {activeGroup ? (
              <div
                className="flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2 shadow-lg"
                style={{ borderLeft: `4px solid ${colorByKey.get(activeGroup.key)}` }}
              >
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: colorByKey.get(activeGroup.key) }} />
                <span className="text-[13px] font-semibold text-foreground">{activeGroup.name}</span>
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      ) : (
        body
      )}

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
    </div>
  );
}

/* ─────────────────────────  Resize grip (cabecera redimensionable) ───────────────────────── */

function ResizeGrip({
  colKey,
  onResizeStart,
  onAutoFit,
}: {
  colKey: GridColKey;
  onResizeStart: (k: GridColKey, e: React.MouseEvent) => void;
  onAutoFit: (k: GridColKey) => void;
}) {
  return (
    <span
      role="separator"
      aria-orientation="vertical"
      aria-label="Ajustar ancho de columna (doble clic para autoajustar)"
      title="Arrastra para redimensionar · doble clic para autoajustar"
      onMouseDown={(e) => onResizeStart(colKey, e)}
      onDoubleClick={(e) => { e.preventDefault(); e.stopPropagation(); onAutoFit(colKey); }}
      className="absolute right-0 top-0 z-20 h-full w-[7px] translate-x-[3px] cursor-col-resize select-none hover:bg-primary/40"
    />
  );
}

/* ─────────────────────────  Group block (banda de servicio + filas) ───────────────────────── */

interface GroupBlockProps {
  group: NormalizedGroup | null;
  color: string;
  rows: NormalizedShift[];
  adapter: PositionMatrixAdapter;
  readOnly?: boolean;
  sortable: boolean;
  dragging: boolean;
  collapsed: boolean;
  onToggleCollapse: () => void;
  onRequestDeleteGroup: () => void;
  onRequestDeleteRow: (id: string) => void;
}

function GroupBlock({
  group,
  color,
  rows,
  adapter,
  readOnly,
  sortable,
  dragging,
  collapsed,
  onToggleCollapse,
  onRequestDeleteGroup,
  onRequestDeleteRow,
}: GroupBlockProps) {
  const { attributes, listeners, setNodeRef } = useSortable({
    id: group?.key ?? `__ungrouped__`,
    disabled: !sortable || !group,
  });

  const [editingName, setEditingName] = useState(false);
  const [draftName, setDraftName] = useState(group?.name ?? "");

  const totalGuards = rows.reduce((s, r) => s + r.guardias * (r.nPuestos || 1), 0);
  const totalPtos = rows.reduce((s, r) => s + (r.nPuestos || 1), 0);
  const groupKey = group?.key ?? null;

  const saveName = () => {
    const name = draftName.trim();
    if (group && name && name !== group.name) adapter.onRenameGroup(group.key, name);
    setEditingName(false);
  };

  // Filas físicas del grupo: solo los turnos (mínimo 1 para el placeholder vacío).
  const physicalRowCount = Math.max(rows.length, 1);

  const serviceCell = (ref?: Ref<HTMLTableCellElement>) => (
    <td
      ref={ref}
      rowSpan={physicalRowCount}
      className="border-b border-r border-border align-top"
      style={{ borderLeft: `4px solid ${color}`, opacity: dragging ? 0.5 : undefined }}
    >
      <div className="flex h-full flex-col gap-1 px-2 py-1.5">
        <div className="flex items-center gap-1.5">
          {sortable && group && (
            <button
              type="button"
              className="cursor-grab touch-none text-muted-foreground/50 hover:text-muted-foreground active:cursor-grabbing"
              aria-label="Arrastrar para reordenar servicio"
              {...attributes}
              {...listeners}
            >
              <GripVertical className="h-3.5 w-3.5" />
            </button>
          )}
          {group && (
            <button
              type="button"
              onClick={onToggleCollapse}
              className="shrink-0 cursor-pointer text-muted-foreground hover:text-foreground"
              title="Colapsar servicio"
              aria-label="Colapsar servicio"
            >
              <ChevronDown className="h-3.5 w-3.5" />
            </button>
          )}
          <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: color }} aria-hidden />
          {editingName && group ? (
            <Input
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") saveName();
                if (e.key === "Escape") { setEditingName(false); setDraftName(group.name); }
              }}
              onBlur={saveName}
              className="h-7 text-[13px]"
              autoFocus
            />
          ) : (
            <span className="text-[13px] font-semibold leading-tight text-foreground">
              {group?.name ?? "Sin agrupar"}
            </span>
          )}
        </div>

        <span className="text-[11px] text-muted-foreground">
          {rows.length} turno{rows.length !== 1 ? "s" : ""} · {totalGuards} guardia{totalGuards !== 1 ? "s" : ""}
        </span>

        {!readOnly && group && !editingName && (
          <div className="flex flex-wrap items-center gap-0.5">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-6 w-6 text-primary"
              onClick={() => adapter.onAddRow(groupKey)}
              title="Agregar turno"
            >
              <Plus className="h-3 w-3" />
            </Button>
            {adapter.onSetGroupColor && (
              <Popover>
                <PopoverTrigger asChild>
                  <Button type="button" variant="ghost" size="icon" className="h-6 w-6" title="Color">
                    <Palette className="h-3 w-3" style={{ color }} />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-2" align="start">
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
            <Button type="button" variant="ghost" size="icon" className="h-6 w-6" onClick={() => { setDraftName(group.name); setEditingName(true); }} title="Renombrar">
              <Pencil className="h-3 w-3" />
            </Button>
            {adapter.onCloneGroup && (
              <Button type="button" variant="ghost" size="icon" className="h-6 w-6" onClick={() => adapter.onCloneGroup?.(group.key)} title="Duplicar servicio">
                <Copy className="h-3 w-3" />
              </Button>
            )}
            {adapter.onDeleteGroup && (
              <Button type="button" variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={onRequestDeleteGroup} title="Eliminar servicio">
                <Trash2 className="h-3 w-3" />
              </Button>
            )}
          </div>
        )}
      </div>
    </td>
  );

  // El primer <tr> físico lleva la celda de servicio (con rowspan). El resto, no.
  let svcRendered = false;
  const leadingFor = (refForFirst?: Ref<HTMLTableCellElement>) => {
    if (svcRendered) return null;
    svcRendered = true;
    return serviceCell(refForFirst);
  };

  // Servicio colapsado: una sola fila-resumen a todo el ancho.
  if (collapsed && group) {
    return (
      <tr
        className="border-b border-border hover:bg-muted/20"
        style={{ borderLeft: `4px solid ${color}`, borderRight: `4px solid ${color}`, opacity: dragging ? 0.5 : undefined }}
      >
        <td ref={setNodeRef} colSpan={TOTAL_COLS} className="px-2 py-1.5">
          <div className="flex items-center gap-1.5">
            {sortable && (
              <button
                type="button"
                className="cursor-grab touch-none text-muted-foreground/50 hover:text-muted-foreground active:cursor-grabbing"
                aria-label="Arrastrar para reordenar servicio"
                {...attributes}
                {...listeners}
              >
                <GripVertical className="h-3.5 w-3.5" />
              </button>
            )}
            <button
              type="button"
              onClick={onToggleCollapse}
              className="shrink-0 cursor-pointer text-muted-foreground hover:text-foreground"
              title="Expandir servicio"
              aria-label="Expandir servicio"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: color }} aria-hidden />
            <span className="text-[13px] font-semibold text-foreground">{group.name}</span>
            <span className="text-[11px] text-muted-foreground">
              {rows.length} turno{rows.length !== 1 ? "s" : ""} · {totalGuards} gd · {totalPtos} pt
            </span>
          </div>
        </td>
      </tr>
    );
  }

  return (
    <>
      {rows.length === 0 ? (
        <tr className="border-b border-border bg-card">
          {leadingFor(setNodeRef)}
          <td colSpan={REST_COLS} className="px-2 py-2 text-center" style={{ borderRight: `4px solid ${color}` }}>
            {!readOnly ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 gap-1 text-xs text-primary"
                onClick={() => adapter.onAddRow(groupKey)}
              >
                <Plus className="h-3.5 w-3.5" /> Agregar turno
              </Button>
            ) : (
              <span className="text-xs text-muted-foreground">Sin turnos</span>
            )}
          </td>
        </tr>
      ) : (
        rows.map((row, idx) => (
          <GridRow
            key={row.id}
            row={row}
            adapter={adapter}
            readOnly={readOnly}
            color={color}
            leadingCell={leadingFor(idx === 0 ? setNodeRef : undefined)}
            onRequestDelete={() => onRequestDeleteRow(row.id)}
          />
        ))
      )}
    </>
  );
}

/* ─────────────────────────  Fila de turno editable ───────────────────────── */

interface GridRowProps {
  row: NormalizedShift;
  adapter: PositionMatrixAdapter;
  readOnly?: boolean;
  leadingCell?: ReactNode;
  color: string;
  onRequestDelete: () => void;
}

type RowDraft = Pick<
  NormalizedShift,
  "customName" | "puestoId" | "cargoId" | "rolId" | "inicio" | "fin" | "dias" | "guardias" | "nPuestos" | "bruto"
>;

function rowDraftOf(row: NormalizedShift): RowDraft {
  return {
    customName: row.customName ?? "",
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

function GridRow({ row, adapter, readOnly, leadingCell, color, onRequestDelete }: GridRowProps) {
  const { catalogs, currency, ufValue, savingRowId } = adapter;
  const [draft, setDraft] = useState<RowDraft>(() => rowDraftOf(row));
  const ref = useRef(draft);
  ref.current = draft;

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
  const disabled = readOnly;

  return (
    <tr className="border-b border-border/60 hover:bg-muted/20">
      {leadingCell}

      {/* Puesto */}
      <td className="border-r border-border px-2 py-1">
        <CatalogPicker kind="puesto" value={draft.puestoId} disabled={disabled} onChange={(id) => apply({ puestoId: id })} />
      </td>

      {/* Cargo */}
      <td className="border-r border-border px-2 py-1">
        <CatalogPicker kind="cargo" value={draft.cargoId} disabled={disabled} onChange={(id) => apply({ cargoId: id })} />
      </td>

      {/* Rol */}
      <td className="border-r border-border px-2 py-1">
        <CatalogPicker kind="rol" value={draft.rolId} disabled={disabled} onChange={(id) => apply({ rolId: id })} />
      </td>

      {/* Horario (con chip Día/Noche clickeable que invierte el turno) */}
      <td className="border-r border-border px-2 py-1">
        <div className="flex flex-col gap-1">
          {!disabled ? (
            <button
              type="button"
              title="Invertir turno (día ↔ noche)"
              onClick={() => apply({ inicio: ref.current.fin, fin: ref.current.inicio })}
              className={cn(
                "inline-flex h-6 w-fit items-center gap-1 rounded-md border px-1.5 text-[11px] font-semibold transition-colors",
                night
                  ? "border-tint-violet-fg/30 bg-tint-violet text-tint-violet-fg hover:brightness-95"
                  : "border-status-warn-border bg-status-warn-soft text-status-warn-fg hover:brightness-95"
              )}
            >
              {night ? <Moon className="h-3 w-3" /> : <Sun className="h-3 w-3" />}
              {night ? "Noche" : "Día"}
            </button>
          ) : (
            <span
              className={cn(
                "inline-flex h-6 w-fit items-center gap-1 rounded-md border px-1.5 text-[11px] font-semibold",
                night
                  ? "border-tint-violet-fg/30 bg-tint-violet text-tint-violet-fg"
                  : "border-status-warn-border bg-status-warn-soft text-status-warn-fg"
              )}
            >
              {night ? <Moon className="h-3 w-3" /> : <Sun className="h-3 w-3" />}
              {night ? "Noche" : "Día"}
            </span>
          )}
          <div className="flex flex-wrap items-center gap-1">
            <select className={cn(FIELD, "w-[60px] font-mono")} value={draft.inicio} disabled={disabled} onChange={(e) => apply({ inicio: e.target.value })}>
              {HOURS_24.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
            <span className="text-muted-foreground">–</span>
            <select className={cn(FIELD, "w-[60px] font-mono")} value={draft.fin} disabled={disabled} onChange={(e) => apply({ fin: e.target.value })}>
              {HOURS_24.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
        </div>
      </td>

      {/* Días */}
      <td className="border-r border-border px-2 py-1">
        <div className="flex flex-wrap gap-0.5">
          {WEEKDAY_ORDER.map((d) => {
            const on = draft.dias.includes(d);
            return (
              <button
                key={d}
                type="button"
                disabled={disabled}
                onClick={() => toggleDay(d)}
                className={cn(
                  "h-7 w-6 rounded border text-[12px] font-semibold transition-colors",
                  on ? "border-primary/40 bg-primary/15 text-primary" : "border-border bg-card text-muted-foreground hover:bg-muted/40"
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
      <td className="border-r border-border px-2 py-1">
        <Stepper value={draft.guardias} min={1} max={20} disabled={disabled} onChange={(v) => apply({ guardias: v })} />
      </td>

      {/* Ptos */}
      <td className="border-r border-border px-2 py-1">
        <Stepper value={draft.nPuestos} min={1} max={50} disabled={disabled} onChange={(v) => apply({ nPuestos: v })} />
      </td>

      {/* Bruto · Líquido · Mano de obra (apilados) */}
      <td className="border-r border-border px-2 py-1 text-right">
        <div className="flex flex-col items-end gap-0.5">
          <Input
            type="text"
            inputMode="numeric"
            disabled={disabled}
            value={formatNumber(draft.bruto, { minDecimals: 0, maxDecimals: 0 })}
            onChange={(e) => apply({ bruto: parseLocalizedNumber(e.target.value) || 0 })}
            className="h-8 w-full text-right font-mono text-[13px]"
          />
          <span className="font-mono text-[11px] text-muted-foreground">
            {row.liquido != null && row.liquido > 0 ? `líq ${Math.round(row.liquido).toLocaleString("es-CL")}` : "líq —"}
          </span>
          <div className="mt-0.5">
            <CpqDualCurrencyAmount clp={row.costo ?? 0} currency={currency} ufValue={ufValue} size="sm" primaryClassName="font-semibold text-foreground" align="right" />
          </div>
        </div>
      </td>

      {/* Acciones (borde derecho con el color del servicio para cerrar la fila) */}
      <td className="px-1 py-1" style={{ borderRight: `4px solid ${color}` }}>
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

/* ─────────────────────────  Stepper compacto ───────────────────────── */

function Stepper({
  value,
  min,
  max,
  disabled,
  onChange,
}: {
  value: number;
  min: number;
  max: number;
  disabled?: boolean;
  onChange: (v: number) => void;
}) {
  const clamp = (v: number) => Math.max(min, Math.min(max, v));
  return (
    <div className="mx-auto inline-flex items-center rounded-md border border-border bg-card">
      <button
        type="button"
        disabled={disabled || value <= min}
        onClick={() => onChange(clamp(value - 1))}
        className="flex h-9 w-6 items-center justify-center text-muted-foreground transition-colors hover:text-foreground disabled:opacity-30"
        aria-label="Restar"
      >
        <Minus className="h-3 w-3" />
      </button>
      <span className="min-w-[22px] text-center font-mono text-[13px] tabular-nums text-foreground">{value}</span>
      <button
        type="button"
        disabled={disabled || value >= max}
        onClick={() => onChange(clamp(value + 1))}
        className="flex h-9 w-6 items-center justify-center text-muted-foreground transition-colors hover:text-foreground disabled:opacity-30"
        aria-label="Sumar"
      >
        <Plus className="h-3 w-3" />
      </button>
    </div>
  );
}
