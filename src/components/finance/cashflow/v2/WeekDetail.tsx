"use client";

import { useState } from "react";
import {
  ChevronDown,
  ArrowDownLeft,
  ArrowUpRight,
  type LucideIcon,
} from "lucide-react";
import { Surface } from "@/components/opai-ds";
import { cn } from "@/lib/utils";
import type {
  ProjectionBucket,
  VirtualOccurrence,
} from "@/modules/finance/cashflow/types";
import { fmtCLP } from "./format";
import { buildDetailRows, type OccMeta } from "./projection-helpers";
import { MovementRow } from "./MovementRow";
import { GroupRow } from "./GroupRow";

interface Props {
  bucket: ProjectionBucket;
  meta: Map<string, OccMeta>;
  canManage: boolean;
  /** Filtro de texto opcional sobre las occurrences (cliente/contrato/instalación). */
  searchTerm?: string;
  onMove?: (occurrence: VirtualOccurrence) => void;
  onOpenDetail?: (occurrence: VirtualOccurrence, meta?: OccMeta) => void;
}

/** Detalle de la semana seleccionada: Entra (INCOME) / Sale (EXPENSE), cada
 *  sección colapsable con subtotal. */
export function WeekDetail({
  bucket,
  meta,
  canManage,
  searchTerm,
  onMove,
  onOpenDetail,
}: Props) {
  const term = (searchTerm ?? "").trim().toLowerCase();
  const matches = (o: VirtualOccurrence) =>
    !term ||
    [o.name, o.nickname, o.installationName, o.categoryName].some((s) =>
      (s ?? "").toLowerCase().includes(term),
    );
  const visible = bucket.occurrences.filter(matches);
  const income = visible.filter((o) => o.kind === "INCOME");
  const expense = visible.filter((o) => o.kind === "EXPENSE");
  return (
    <div className="space-y-3">
      <Section
        title="Entra"
        tone="ok"
        icon={ArrowDownLeft}
        occurrences={income}
        meta={meta}
        canManage={canManage}
        onMove={onMove}
        onOpenDetail={onOpenDetail}
      />
      <Section
        title="Sale"
        tone="danger"
        icon={ArrowUpRight}
        occurrences={expense}
        meta={meta}
        canManage={canManage}
        onMove={onMove}
        onOpenDetail={onOpenDetail}
      />
    </div>
  );
}

interface SectionProps {
  title: string;
  tone: "ok" | "danger";
  icon: LucideIcon;
  occurrences: VirtualOccurrence[];
  meta: Map<string, OccMeta>;
  canManage: boolean;
  onMove?: (occurrence: VirtualOccurrence) => void;
  onOpenDetail?: (occurrence: VirtualOccurrence, meta?: OccMeta) => void;
}

function Section({
  title,
  tone,
  icon: Icon,
  occurrences,
  meta,
  canManage,
  onMove,
  onOpenDetail,
}: SectionProps) {
  const [open, setOpen] = useState(true);
  const [showZero, setShowZero] = useState(false);
  const { rows, zeroCount } = buildDetailRows(occurrences);
  const subtotal = rows.reduce(
    (s, r) => s + (r.type === "group" ? r.totalClp : r.occ.amountClp),
    0,
  );
  const zeroOccs = occurrences.filter((o) => o.amountClp === 0);
  const toneFg = tone === "ok" ? "text-status-ok-fg" : "text-status-danger-fg";
  return (
    <Surface padding="sm">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex min-h-[44px] w-full items-center justify-between gap-2"
      >
        <span className="flex items-center gap-2">
          <ChevronDown
            className={cn(
              "h-4 w-4 text-ds-text-3 transition-transform",
              !open && "-rotate-90",
            )}
          />
          <Icon className={cn("h-4 w-4", toneFg)} />
          <span className="text-[13px] font-semibold text-ds-text-1">{title}</span>
          <span className="font-mono text-[12px] text-ds-text-3">{rows.length}</span>
        </span>
        <span className={cn("font-mono text-[13px] tabular-nums", toneFg)}>
          {fmtCLP.format(subtotal)}
        </span>
      </button>
      {open &&
        (rows.length > 0 || zeroCount > 0 ? (
          <div className="mt-1 border-t border-ds-border-subtle">
            <div className="divide-y divide-ds-border-subtle">
              {rows.map((r, i) =>
                r.type === "group" ? (
                  <GroupRow
                    key={`grp-${r.label}`}
                    label={r.label}
                    totalClp={r.totalClp}
                    items={r.items}
                    meta={meta}
                    canManage={canManage}
                    onMove={onMove}
                    onOpenDetail={onOpenDetail}
                  />
                ) : (
                  <MovementRow
                    key={r.occ.id ?? `s-${i}`}
                    occurrence={r.occ}
                    meta={r.occ.id ? meta.get(r.occ.id) : undefined}
                    canManage={canManage}
                    onMove={onMove}
                    onOpenDetail={onOpenDetail}
                  />
                ),
              )}
            </div>
            {zeroCount > 0 && (
              <div className="pt-1.5">
                <button
                  type="button"
                  onClick={() => setShowZero((v) => !v)}
                  aria-expanded={showZero}
                  className="flex min-h-[36px] items-center text-[12px] text-ds-text-3 hover:text-ds-text-2"
                >
                  {showZero ? "Ocultar sin monto" : `+${zeroCount} sin monto esta semana`}
                </button>
                {showZero && (
                  <div className="divide-y divide-ds-border-subtle border-t border-ds-border-subtle">
                    {zeroOccs.map((o, i) => (
                      <MovementRow
                        key={o.id ?? `z-${i}`}
                        occurrence={o}
                        meta={o.id ? meta.get(o.id) : undefined}
                        canManage={canManage}
                        onMove={onMove}
                        onOpenDetail={onOpenDetail}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        ) : (
          <p className="mt-2 text-[12px] text-ds-text-3">Sin movimientos.</p>
        ))}
    </Surface>
  );
}
