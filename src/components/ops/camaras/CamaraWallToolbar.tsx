"use client";

import { SegmentedControl } from "@/components/opai-ds";
import { FilterChipsBar } from "@/components/opai-ds";
import type { CamaraDto } from "./types";
import { GRID_SIZES } from "@/lib/camaras/types";

type AccountOpt = { id: string; name: string };
type InstOpt = { id: string; name: string; accountId: string | null };

type Props = {
  cameras: CamaraDto[];
  accountId: string;
  onAccount: (id: string) => void;
  selectedInst: string[];
  onToggleInst: (id: string) => void;
  onClearInst: () => void;
  gridSize: number;
  onGrid: (n: number) => void;
  cycling: boolean;
  onCycling: (v: boolean) => void;
  showCycle: boolean;
};

export function accountsFrom(cameras: CamaraDto[]): AccountOpt[] {
  const map = new Map<string, string>();
  for (const c of cameras) {
    const acc = c.installation?.account;
    if (acc) map.set(acc.id, acc.name);
  }
  return [...map.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
}

export function instFrom(cameras: CamaraDto[], accountId: string): InstOpt[] {
  const map = new Map<string, InstOpt>();
  for (const c of cameras) {
    const inst = c.installation;
    if (!inst) continue;
    if (accountId && inst.accountId !== accountId) continue;
    map.set(inst.id, { id: inst.id, name: inst.name, accountId: inst.accountId });
  }
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export function CamaraWallToolbar({
  cameras, accountId, onAccount, selectedInst, onToggleInst, onClearInst,
  gridSize, onGrid, cycling, onCycling, showCycle,
}: Props) {
  const accounts = accountsFrom(cameras);
  const insts = instFrom(cameras, accountId);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <select
          aria-label="Cliente"
          className="h-10 sm:h-9 min-w-[180px] rounded-md border border-ds-border-default bg-ds-surface-1 px-3 text-[13px] text-ds-text-1"
          value={accountId}
          onChange={(e) => onAccount(e.target.value)}
        >
          <option value="">Todos los clientes</option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>{a.name}</option>
          ))}
        </select>
        <SegmentedControl
          ariaLabel="Grilla"
          value={String(gridSize)}
          onChange={(id) => onGrid(Number(id))}
          items={GRID_SIZES.map((n) => ({ id: String(n), label: String(n) }))}
        />
        {showCycle && (
          <label className="flex h-11 items-center gap-2 text-[13px] text-ds-text-2">
            <input type="checkbox" checked={cycling} onChange={(e) => onCycling(e.target.checked)} />
            Ciclado 12s
          </label>
        )}
      </div>
      {insts.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {insts.map((inst) => (
            <button
              key={inst.id}
              type="button"
              onClick={() => onToggleInst(inst.id)}
              className={`h-11 rounded-full border px-3 text-[13px] ${
                selectedInst.includes(inst.id)
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-ds-border-default text-ds-text-2"
              }`}
            >
              {inst.name}
            </button>
          ))}
        </div>
      )}
      <FilterChipsBar
        chips={selectedInst.map((id) => ({
          key: id,
          label: insts.find((i) => i.id === id)?.name ?? id,
          onClear: () => onToggleInst(id),
        }))}
        onClearAll={selectedInst.length ? onClearInst : undefined}
      />
    </div>
  );
}
