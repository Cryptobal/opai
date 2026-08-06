"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { FlowMatrixRowDto } from "@/modules/finance/flow-v3/matrix-types";
import { SECTION_LABELS, SECTION_ORDER } from "./grid-classes";
import type { RowTemplate } from "./menu-builders";

const SELECT_CLASS =
  "h-9 w-full rounded-md border border-ds-border-default bg-ds-surface-1 px-2 text-sm text-ds-text-1";

const SIGN_GROUP = (s: string) => (s === "INGRESOS" || s === "FINANCIAMIENTO" ? "in" : "out");

/** Cambiar la sección de una fila. Advierte cuando el cambio invierte el signo
 *  del plan (mueve el saldo). */
export function ChangeSectionDialog({
  row, busy, onConfirm, onClose,
}: {
  row: FlowMatrixRowDto | null;
  busy: boolean;
  onConfirm: (section: string) => void;
  onClose: () => void;
}) {
  const [section, setSection] = useState(row?.section ?? "INGRESOS");
  useEffect(() => {
    if (row) setSection(row.section);
  }, [row]);
  if (!row) return null;
  const signFlips = SIGN_GROUP(section) !== SIGN_GROUP(row.section);

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Cambiar sección de «{row.name}»</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <label className="block space-y-1 text-xs text-ds-text-3">
            <span>Sección</span>
            <select className={SELECT_CLASS} value={section} onChange={(e) => setSection(e.target.value)}>
              {SECTION_ORDER.map((s) => (
                <option key={s} value={s}>{SECTION_LABELS[s]}</option>
              ))}
            </select>
          </label>
          {signFlips && (
            <p className="rounded border border-status-warn-border bg-status-warn-soft/40 px-2 py-1.5 text-xs text-status-warn-fg">
              Este cambio invierte el signo del plan de la fila y moverá el saldo proyectado.
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button disabled={busy || section === row.section} onClick={() => onConfirm(section)}>
            {busy ? "Guardando…" : "Cambiar sección"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Asignar o cambiar las cuentas contables de un renglón de egreso. */
export function ChangeAccountsDialog({
  row, busy, onConfirm, onClose,
}: {
  row: FlowMatrixRowDto | null;
  busy: boolean;
  onConfirm: (accountPlanIds: string[], defaultTargetId?: string | null) => void;
  onClose: () => void;
}) {
  const [accountOptions, setAccountOptions] = useState<Array<{ id: string; code: string; name: string }>>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [defaultTarget, setDefaultTarget] = useState<string>("");

  useEffect(() => {
    if (!row) return;
    setSelected([]);
    setDefaultTarget("");
    fetch("/api/finance/accounting/accounts", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        const flat: Array<{ id: string; code: string; name: string }> = [];
        const walk = (nodes: Array<{ id: string; code: string; name: string; acceptsEntries?: boolean; children?: unknown[] }>) => {
          for (const n of nodes) {
            if (n.acceptsEntries !== false) flat.push({ id: n.id, code: n.code, name: n.name });
            if (Array.isArray(n.children)) walk(n.children as typeof nodes);
          }
        };
        walk((j.data ?? []) as Parameters<typeof walk>[0]);
        setAccountOptions(flat);
      })
      .catch(() => setAccountOptions([]));
    fetch(`/api/finance/flow-v3/rows/${row.id}/accounts`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        const list = (j.data ?? []) as Array<{ accountPlanId: string; isDefaultTarget: boolean }>;
        const ids = list.map((m) => m.accountPlanId);
        setSelected(ids);
        setDefaultTarget(list.find((m) => m.isDefaultTarget)?.accountPlanId ?? ids[0] ?? "");
      })
      .catch(() => setSelected([]));
  }, [row]);

  if (!row) return null;

  const toggle = (id: string) => {
    setSelected((prev) => {
      if (prev.includes(id)) {
        const next = prev.filter((x) => x !== id);
        if (defaultTarget === id) setDefaultTarget(next[0] ?? "");
        return next;
      }
      const next = [...prev, id];
      if (!defaultTarget) setDefaultTarget(id);
      return next;
    });
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Cuentas de «{row.name}»</DialogTitle>
        </DialogHeader>
        <p className="text-[13px] text-ds-text-3">
          Sin cuentas contables el renglón no puede recibir movimientos de cartola.
        </p>
        <ul className="max-h-[280px] overflow-y-auto space-y-1 border border-ds-border-subtle rounded-ds-md p-2">
          {accountOptions.map((a) => (
            <li key={a.id}>
              <label className="flex items-center gap-2 min-h-11 px-2 text-[13px] cursor-pointer hover:bg-ds-surface-2 rounded-ds-sm">
                <input
                  type="checkbox"
                  checked={selected.includes(a.id)}
                  onChange={() => toggle(a.id)}
                />
                <span className="font-mono text-[12px] text-ds-text-3">{a.code}</span>
                <span className="truncate">{a.name}</span>
              </label>
            </li>
          ))}
        </ul>
        {selected.length > 1 && (
          <label className="block space-y-1 text-xs text-ds-text-3">
            <span>Destino por defecto (cartola ambigua)</span>
            <select
              className={SELECT_CLASS}
              value={defaultTarget}
              onChange={(e) => setDefaultTarget(e.target.value)}
            >
              {selected.map((id) => {
                const a = accountOptions.find((x) => x.id === id);
                return (
                  <option key={id} value={id}>
                    {a ? `${a.code} · ${a.name}` : id}
                  </option>
                );
              })}
            </select>
          </label>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button
            disabled={busy || selected.length === 0}
            onClick={() =>
              onConfirm(
                selected,
                selected.length > 1 ? defaultTarget || selected[0] : null,
              )
            }
          >
            {busy ? "Guardando…" : "Guardar cuentas"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** @deprecated Usar ChangeAccountsDialog. Conservado para compatibilidad temporal. */
export function ChangeCategoryDialog({
  row, busy, onConfirm, onClose,
}: {
  row: FlowMatrixRowDto | null;
  busy: boolean;
  onConfirm: (categoryId: string, opts?: { mapping?: "CATEGORY" }) => void;
  onClose: () => void;
}) {
  const [categories, setCategories] = useState<Array<{ id: string; name: string; kind: string }>>([]);
  const [categoryId, setCategoryId] = useState(row?.categoryId ?? "");
  useEffect(() => {
    if (!row) return;
    setCategoryId(row.categoryId ?? "");
    fetch("/api/finance/cashflow/categorias", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => setCategories((j.data ?? []) as Array<{ id: string; name: string; kind: string }>))
      .catch(() => setCategories([]));
  }, [row]);
  const expense = useMemo(() => categories.filter((c) => c.kind === "EXPENSE"), [categories]);
  if (!row) return null;

  const isFirstAssign = !row.categoryId || row.mapping === "MANUAL";

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>
            {isFirstAssign
              ? `Asignar categoría a «${row.name}»`
              : `Cambiar categoría de «${row.name}»`}
          </DialogTitle>
        </DialogHeader>
        {isFirstAssign && (
          <p className="text-[13px] text-ds-text-3">
            Sin categoría esta fila no puede recibir movimientos de la cartola.
            Elegí la categoría de egreso a la que se van a rutar.
          </p>
        )}
        <label className="block space-y-1 text-xs text-ds-text-3">
          <span>Categoría de egreso</span>
          <select className={SELECT_CLASS} value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            <option value="">Seleccionar…</option>
            {expense.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </label>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button
            disabled={busy || !categoryId || categoryId === row.categoryId}
            onClick={() =>
              onConfirm(
                categoryId,
                isFirstAssign ? { mapping: "CATEGORY" } : undefined,
              )
            }
          >
            {busy ? "Guardando…" : isFirstAssign ? "Asignar categoría" : "Cambiar categoría"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Aplazar/fijar término de una programación. Alcance explícito en pantalla. */
export function DeferTermDialog({
  template, busy, onConfirm, onClose,
}: {
  template: RowTemplate | null;
  busy: boolean;
  onConfirm: (endDate: string | null) => void;
  onClose: () => void;
}) {
  const [date, setDate] = useState("");
  useEffect(() => {
    setDate(template?.endDate ?? "");
  }, [template]);
  if (!template) return null;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Aplazar/fijar término</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-xs text-ds-text-3">
            {template.label ? <span className="font-medium text-ds-text-2">{template.label}</span> : null}
          </p>
          <p className="rounded border border-ds-border-subtle bg-ds-surface-2 px-2 py-1.5 text-xs text-ds-text-2">
            Afecta todas las cuotas futuras de esta programación.
          </p>
          <label className="block space-y-1 text-xs text-ds-text-3">
            <span>Fecha de término</span>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onConfirm(null)} disabled={busy}>
            Sin término
          </Button>
          <Button disabled={busy || !date} onClick={() => onConfirm(date)}>
            {busy ? "Guardando…" : "Fijar término"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Días de cobro (emisión → cobro) de una programación. */
export function DiasCobroDialog({
  template, busy, onConfirm, onClose,
}: {
  template: RowTemplate | null;
  busy: boolean;
  onConfirm: (dias: number | null) => void;
  onClose: () => void;
}) {
  const [dias, setDias] = useState("");
  useEffect(() => {
    setDias(template?.diasCobro != null ? String(template.diasCobro) : "");
  }, [template]);
  if (!template) return null;
  const n = dias.trim() === "" ? null : Number(dias);
  const valid = n == null || (Number.isInteger(n) && n >= 0 && n <= 180);

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Días de cobro</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="rounded border border-ds-border-subtle bg-ds-surface-2 px-2 py-1.5 text-xs text-ds-text-2">
            Cuántos días después de emitida se espera el cobro. Afecta todas las cuotas futuras de
            esta programación. Vacío = según la configuración del tenant.
          </p>
          <label className="block space-y-1 text-xs text-ds-text-3">
            <span>Días (0–180)</span>
            <Input
              type="number"
              min={0}
              max={180}
              value={dias}
              onChange={(e) => setDias(e.target.value)}
              placeholder="según config"
            />
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button disabled={busy || !valid} onClick={() => onConfirm(n)}>
            {busy ? "Guardando…" : "Guardar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
