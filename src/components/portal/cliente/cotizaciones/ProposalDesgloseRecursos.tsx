"use client";

import { useState } from "react";
import { ChevronDown, Package, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ResourceBreakdownCategoryPortal } from "./types";

interface ProposalDesgloseRecursosProps {
  resourceBreakdown: ResourceBreakdownCategoryPortal[];
  currency?: string;
  ufValue?: number;
  sectionNumber: number;
  defaultOpen?: boolean;
  className?: string;
}

function fmtCLP(n: number) {
  return new Intl.NumberFormat("es-CL", {
    style: "currency",
    currency: "CLP",
    maximumFractionDigits: 0,
  }).format(Math.round(n));
}

function fmtUF(n: number) {
  return `${n.toFixed(2)} UF`;
}

export function ProposalDesgloseRecursos({
  resourceBreakdown,
  currency,
  ufValue,
  sectionNumber,
  defaultOpen = false,
  className,
}: ProposalDesgloseRecursosProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const [expandedCats, setExpandedCats] = useState<Record<number, boolean>>({});

  const fmt = (n: number) => {
    if (currency === "UF" && ufValue && ufValue > 0) {
      return fmtUF(n);
    }
    return fmtCLP(n);
  };

  const directCats = resourceBreakdown.filter((c) => c.categoryType === "direct");
  const indirectCats = resourceBreakdown.filter((c) => c.categoryType === "indirect");
  const allCats = [...directCats, ...indirectCats];
  const totalItems = allCats.reduce((s, c) => s + c.items.length, 0);
  const grandTotal = allCats.reduce((s, c) => s + c.subtotal, 0);

  const toggleCat = (idx: number) =>
    setExpandedCats((prev) => ({ ...prev, [idx]: !prev[idx] }));

  if (allCats.length === 0) return null;

  return (
    <div className={cn("rounded-xl border border-slate-700/50 overflow-hidden", className)}>
      <button
        type="button"
        onClick={() => setIsOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 bg-slate-800/50 hover:bg-slate-800/70 transition-colors"
      >
        <div className="flex items-center gap-2.5">
          <Package className="h-5 w-5 text-violet-400" />
          <h3 className="text-xl font-bold text-white">
            <span className="text-violet-400">{sectionNumber}.</span> Desglose de Equipamiento y Recursos
          </h3>
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-violet-500/15 text-violet-400 font-medium">
            {totalItems} ítems
          </span>
        </div>
        <ChevronDown
          className={cn(
            "h-5 w-5 text-slate-500 transition-transform",
            isOpen && "rotate-180",
          )}
        />
      </button>

      {isOpen && (
        <div className="px-4 py-4 bg-slate-800/30 space-y-3">
          <div className="flex items-center gap-4 px-3 py-2 rounded-lg bg-white/[0.02] border border-white/[0.04] text-[10px] text-slate-500">
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-sm bg-status-info" />
              <span>Costos Directos</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-sm bg-status-warn" />
              <span>Costos Indirectos</span>
            </div>
            <span className="ml-auto">{allCats.length} categorías</span>
          </div>

          {allCats.map((cat, catIdx) => {
            const isDirect = cat.categoryType === "direct";
            const isExpanded = expandedCats[catIdx] !== false;
            const color = isDirect ? "text-status-info-fg" : "text-status-warn-fg";
            const bgColor = isDirect ? "bg-status-info-soft" : "bg-status-warn-soft";

            return (
              <div key={catIdx} className="rounded-lg border border-white/[0.06] overflow-hidden">
                <button
                  type="button"
                  onClick={() => toggleCat(catIdx)}
                  className={cn("w-full flex items-center justify-between px-3 py-2 hover:opacity-80 transition-opacity", bgColor)}
                >
                  <div className="flex items-center gap-2">
                    <span className={cn("text-xs font-bold uppercase tracking-wider", color)}>
                      {cat.category}
                    </span>
                    <span className="text-[9px] text-slate-500">
                      ({cat.items.length} {cat.items.length === 1 ? "ítem" : "ítems"})
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={cn("text-xs font-mono font-bold", color)}>
                      {fmt(cat.subtotal)}
                    </span>
                    <ChevronDown
                      className={cn(
                        "h-3.5 w-3.5 text-slate-500 transition-transform",
                        isExpanded && "rotate-180",
                      )}
                    />
                  </div>
                </button>

                {isExpanded && (
                  <div className="px-3 py-2 space-y-1.5">
                    {cat.items.map((item, itemIdx) => (
                      <div key={itemIdx} className="group">
                        <div className="flex items-center justify-between py-1">
                          <div className="flex-1 min-w-0">
                            <span className="text-xs text-slate-300 font-medium">
                              {item.name}
                            </span>
                            {item.unit && (
                              <span className="ml-2 text-[9px] text-slate-600">
                                {item.unit}
                              </span>
                            )}
                          </div>
                          <span className="text-xs font-mono text-slate-400 shrink-0 ml-2">
                            {fmt(item.amount)}
                          </span>
                        </div>
                        {item.technicalSpecs && (
                          <div className="flex items-start gap-1.5 pl-2 pb-1.5">
                            <Info className="h-3 w-3 text-slate-600 shrink-0 mt-0.5" />
                            <p className="text-[10px] text-slate-500 italic leading-relaxed">
                              {item.technicalSpecs}
                            </p>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}

          <div className="flex items-center justify-between px-4 py-3 rounded-lg bg-violet-600/15 border border-violet-500/25">
            <span className="text-sm font-bold text-white">TOTAL EQUIPAMIENTO Y RECURSOS</span>
            <span className="text-lg font-bold text-violet-400 font-mono">{fmt(grandTotal)}</span>
          </div>

          <p className="text-[10px] text-slate-500 text-right">
            Montos mensuales · Especificaciones sujetas a disponibilidad
          </p>
        </div>
      )}
    </div>
  );
}
