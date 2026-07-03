"use client";

/**
 * Editores en línea para la tabla de Tipos de Ticket (Fase 11):
 *  - ChainEditorCell    → popover para editar la cadena de aprobación (equipos/
 *                         usuarios): agregar/quitar/reordenar; guarda al confirmar.
 *  - AssigneeCell       → popover con búsqueda para el responsable por defecto.
 *  - BulkActionBar      → barra flotante para aplicar cambios a N tipos.
 * Todos son "fachada": el guardado real lo hace el cliente contra los endpoints
 * ([id] PATCH y /batch PATCH). Cada celda muestra su estado tri-estado al guardar.
 */

import { useMemo, useState } from "react";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ArrowUp,
  ArrowDown,
  Check,
  ChevronDown,
  Loader2,
  Plus,
  Search,
  Trash2,
  UserRound,
  X,
} from "lucide-react";
import type {
  TicketTypeApprovalStep,
  ApproverType,
  TicketPriority,
} from "@/lib/tickets";
import { TICKET_PRIORITY_CONFIG } from "@/lib/tickets";
import type { AdminGroup } from "@/lib/groups";

export type Admin = { id: string; name: string | null; email: string };

export interface ChainStepDraft {
  id: string;
  approverType: ApproverType;
  approverGroupId: string | null;
  approverUserId: string | null;
  label: string;
}

function genId(): string {
  return `step_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

function stepsToDrafts(steps: TicketTypeApprovalStep[]): ChainStepDraft[] {
  return steps.map((s) => ({
    id: s.id || genId(),
    approverType: s.approverType,
    approverGroupId: s.approverGroupId,
    approverUserId: s.approverUserId,
    label: s.label,
  }));
}

function adminLabel(a: Admin): string {
  return a.name || a.email;
}

/** Payload de la cadena que consume el endpoint (approvalSteps + stepOrder). */
export function draftsToPayload(drafts: ChainStepDraft[]) {
  return drafts.map((s, idx) => ({
    stepOrder: idx + 1,
    approverType: s.approverType,
    approverGroupId: s.approverType === "group" ? s.approverGroupId : null,
    approverUserId: s.approverType === "user" ? s.approverUserId : null,
    label: s.label,
    isRequired: true,
  }));
}

// ═══════════════════════════════════════════════════════════════
//  Cadena de aprobación (inline)
// ═══════════════════════════════════════════════════════════════

function chainSummaryLabel(
  steps: TicketTypeApprovalStep[],
  groups: AdminGroup[],
  admins: Admin[],
): string {
  if (steps.length === 0) return "Sin aprobación";
  return steps
    .map((s) => {
      if (s.approverType === "group") {
        return (
          s.approverGroupName ??
          groups.find((g) => g.id === s.approverGroupId)?.name ??
          "Grupo"
        );
      }
      const a = admins.find((x) => x.id === s.approverUserId);
      return a ? adminLabel(a) : s.approverUserName ?? "Usuario";
    })
    .join(" → ");
}

export function ChainEditorCell({
  steps,
  groups,
  admins,
  saving,
  onSave,
}: {
  steps: TicketTypeApprovalStep[];
  groups: AdminGroup[];
  admins: Admin[];
  saving: boolean;
  onSave: (drafts: ChainStepDraft[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [drafts, setDrafts] = useState<ChainStepDraft[]>([]);

  function begin(next: boolean) {
    if (next) setDrafts(stepsToDrafts(steps));
    setOpen(next);
  }

  function update(idx: number, patch: Partial<ChainStepDraft>) {
    setDrafts((prev) => prev.map((s, i) => (i === idx ? { ...s, ...patch } : s)));
  }
  function move(idx: number, dir: -1 | 1) {
    setDrafts((prev) => {
      const j = idx + dir;
      if (j < 0 || j >= prev.length) return prev;
      const copy = [...prev];
      [copy[idx], copy[j]] = [copy[j], copy[idx]];
      return copy;
    });
  }
  function add() {
    setDrafts((prev) => [
      ...prev,
      { id: genId(), approverType: "group", approverGroupId: null, approverUserId: null, label: "" },
    ]);
  }
  function remove(idx: number) {
    setDrafts((prev) => prev.filter((_, i) => i !== idx));
  }

  const valid = drafts.every((s) =>
    s.approverType === "group" ? !!s.approverGroupId : !!s.approverUserId,
  );

  const summary = chainSummaryLabel(steps, groups, admins);

  return (
    <Popover open={open} onOpenChange={begin}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-1.5 rounded-md border border-transparent px-2 py-1 text-xs hover:border-border hover:bg-accent/40 transition-colors max-w-[240px]"
          title="Editar cadena de aprobación"
        >
          {saving ? (
            <Loader2 className="h-3 w-3 animate-spin text-muted-foreground shrink-0" />
          ) : null}
          <span className={`truncate ${steps.length === 0 ? "text-muted-foreground italic" : ""}`}>
            {summary}
          </span>
          <ChevronDown className="h-3 w-3 text-muted-foreground/60 shrink-0" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[320px] p-3 space-y-2">
        <p className="text-xs font-semibold">Cadena de aprobación</p>
        {drafts.length === 0 && (
          <p className="text-[11px] text-muted-foreground italic">
            Sin pasos. El tipo no requerirá aprobación.
          </p>
        )}
        <div className="space-y-2 max-h-[260px] overflow-y-auto pr-1">
          {drafts.map((s, idx) => (
            <div key={s.id} className="rounded-md border border-border bg-accent/20 p-2 space-y-1.5">
              <div className="flex items-center gap-1.5">
                <span className="flex h-4 w-4 items-center justify-center rounded-full bg-primary/15 text-primary text-[9px] font-semibold shrink-0">
                  {idx + 1}
                </span>
                <Select
                  value={s.approverType}
                  onValueChange={(v) =>
                    update(idx, {
                      approverType: v as ApproverType,
                      approverGroupId: null,
                      approverUserId: null,
                    })
                  }
                >
                  <SelectTrigger className="h-7 text-[11px] flex-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="group">Grupo</SelectItem>
                    <SelectItem value="user">Usuario</SelectItem>
                  </SelectContent>
                </Select>
                <button
                  type="button"
                  onClick={() => move(idx, -1)}
                  disabled={idx === 0}
                  className="p-1 rounded hover:bg-accent disabled:opacity-30"
                  title="Subir"
                >
                  <ArrowUp className="h-3 w-3" />
                </button>
                <button
                  type="button"
                  onClick={() => move(idx, 1)}
                  disabled={idx === drafts.length - 1}
                  className="p-1 rounded hover:bg-accent disabled:opacity-30"
                  title="Bajar"
                >
                  <ArrowDown className="h-3 w-3" />
                </button>
                <button
                  type="button"
                  onClick={() => remove(idx)}
                  className="p-1 rounded hover:bg-destructive/10"
                  title="Quitar paso"
                >
                  <Trash2 className="h-3 w-3 text-destructive" />
                </button>
              </div>
              {s.approverType === "group" ? (
                <Select
                  value={s.approverGroupId ?? ""}
                  onValueChange={(v) => {
                    const g = groups.find((x) => x.id === v);
                    update(idx, { approverGroupId: v, label: g ? `Aprobación ${g.name}` : "" });
                  }}
                >
                  <SelectTrigger className="h-7 text-[11px]">
                    <SelectValue placeholder="Seleccionar grupo…" />
                  </SelectTrigger>
                  <SelectContent>
                    {groups.filter((g) => g.isActive).map((g) => (
                      <SelectItem key={g.id} value={g.id}>
                        {g.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Select
                  value={s.approverUserId ?? ""}
                  onValueChange={(v) => {
                    const a = admins.find((x) => x.id === v);
                    update(idx, { approverUserId: v, label: a ? `Aprobación: ${adminLabel(a)}` : "" });
                  }}
                >
                  <SelectTrigger className="h-7 text-[11px]">
                    <SelectValue placeholder="Seleccionar usuario…" />
                  </SelectTrigger>
                  <SelectContent>
                    {admins.map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        {adminLabel(a)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          ))}
        </div>
        <div className="flex items-center justify-between pt-1">
          <Button type="button" variant="outline" size="sm" className="h-7 gap-1 text-[11px]" onClick={add}>
            <Plus className="h-3 w-3" />
            Paso
          </Button>
          <div className="flex items-center gap-1.5">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 text-[11px]"
              onClick={() => setOpen(false)}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              size="sm"
              className="h-7 gap-1 text-[11px]"
              disabled={!valid || saving}
              onClick={() => {
                onSave(drafts);
                setOpen(false);
              }}
            >
              {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
              Guardar
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ═══════════════════════════════════════════════════════════════
//  Responsable por defecto (inline, con búsqueda)
// ═══════════════════════════════════════════════════════════════

export function AssigneeCell({
  value,
  admins,
  saving,
  onChange,
}: {
  value: string | null;
  admins: Admin[];
  saving: boolean;
  onChange: (adminId: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");

  const current = value ? admins.find((a) => a.id === value) : null;
  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return admins;
    return admins.filter((a) => adminLabel(a).toLowerCase().includes(t) || a.email.toLowerCase().includes(t));
  }, [q, admins]);

  return (
    <Popover open={open} onOpenChange={(n) => { setOpen(n); if (n) setQ(""); }}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-1.5 rounded-md border border-transparent px-2 py-1 text-xs hover:border-border hover:bg-accent/40 transition-colors max-w-[200px]"
          title="Editar responsable por defecto"
        >
          {saving ? (
            <Loader2 className="h-3 w-3 animate-spin text-muted-foreground shrink-0" />
          ) : (
            <UserRound className="h-3 w-3 text-muted-foreground shrink-0" />
          )}
          <span className={`truncate ${current ? "" : "text-muted-foreground italic"}`}>
            {current ? adminLabel(current) : "Sin responsable"}
          </span>
          <ChevronDown className="h-3 w-3 text-muted-foreground/60 shrink-0" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[240px] p-0">
        <div className="flex items-center gap-1.5 border-b border-border px-2.5 py-2">
          <Search className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar admin…"
            className="w-full bg-transparent text-xs outline-none placeholder:text-muted-foreground"
          />
        </div>
        <div className="max-h-[240px] overflow-y-auto py-1">
          <button
            type="button"
            onClick={() => { onChange(null); setOpen(false); }}
            className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs hover:bg-accent"
          >
            <X className="h-3 w-3 text-muted-foreground" />
            <span className="italic text-muted-foreground">Sin responsable</span>
            {!value && <Check className="ml-auto h-3 w-3 text-primary" />}
          </button>
          {filtered.map((a) => (
            <button
              key={a.id}
              type="button"
              onClick={() => { onChange(a.id); setOpen(false); }}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs hover:bg-accent"
            >
              <span className="truncate">{adminLabel(a)}</span>
              {value === a.id && <Check className="ml-auto h-3 w-3 text-primary shrink-0" />}
            </button>
          ))}
          {filtered.length === 0 && (
            <p className="px-3 py-2 text-[11px] text-muted-foreground">Sin coincidencias.</p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ═══════════════════════════════════════════════════════════════
//  Barra de acciones masivas
// ═══════════════════════════════════════════════════════════════

export function BulkActionBar({
  count,
  groups,
  admins,
  busy,
  onClear,
  onSetChain,
  onSetAssignee,
  onSetPriority,
}: {
  count: number;
  groups: AdminGroup[];
  admins: Admin[];
  busy: boolean;
  onClear: () => void;
  onSetChain: (drafts: ChainStepDraft[]) => void;
  onSetAssignee: (adminId: string | null) => void;
  onSetPriority: (p: TicketPriority) => void;
}) {
  return (
    <div className="sticky top-2 z-20 flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card/95 backdrop-blur px-3 py-2 shadow-sm">
      <span className="text-xs font-medium">
        Aplicar a <span className="tabular-nums">{count}</span> tipo{count !== 1 ? "s" : ""}:
      </span>

      {/* Fijar cadena */}
      <ChainEditorCell
        steps={[]}
        groups={groups}
        admins={admins}
        saving={busy}
        onSave={onSetChain}
      />

      {/* Fijar responsable */}
      <AssigneeCell value={null} admins={admins} saving={busy} onChange={onSetAssignee} />

      {/* Fijar prioridad */}
      <Select onValueChange={(v) => onSetPriority(v as TicketPriority)}>
        <SelectTrigger className="h-8 w-[150px] text-xs">
          <SelectValue placeholder="Fijar prioridad…" />
        </SelectTrigger>
        <SelectContent>
          {(Object.entries(TICKET_PRIORITY_CONFIG) as [TicketPriority, { label: string; color: string }][]).map(
            ([key, cfg]) => (
              <SelectItem key={key} value={key}>
                <span className={cfg.color}>{cfg.label}</span>
              </SelectItem>
            ),
          )}
        </SelectContent>
      </Select>

      <button
        type="button"
        onClick={onClear}
        className="ml-auto inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-accent"
      >
        <X className="h-3.5 w-3.5" />
        Deseleccionar
      </button>
    </div>
  );
}
