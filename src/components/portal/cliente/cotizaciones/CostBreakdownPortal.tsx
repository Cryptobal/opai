"use client";

import { cn, formatCurrency } from "@/lib/utils";
import type { CostByCategoryPortal } from "./types";

interface CostBreakdownPortalProps {
  categories: CostByCategoryPortal[];
  currency: string;
  numbered?: boolean;
  className?: string;
}

const TYPE_LABELS: Record<string, string> = {
  direct: "Costos directos",
  indirect: "Costos indirectos",
};

export function CostBreakdownPortal({
  categories,
  currency,
  numbered,
  className,
}: CostBreakdownPortalProps) {
  if (!categories.length) return null;

  const fmt = (v: number) => formatCurrency(v, currency === "UF" ? "UF" : "CLP");
  const grouped = { direct: categories.filter((c) => c.type === "direct"), indirect: categories.filter((c) => c.type !== "direct") };

  let sectionNum = 0;

  return (
    <div className={cn("space-y-3", className)}>
      <h4 className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">
        {numbered && `${++sectionNum}. `}Desglose de costos
      </h4>

      {(["direct", "indirect"] as const).map((type) => {
        const cats = grouped[type];
        if (!cats.length) return null;
        return (
          <div key={type} className="space-y-2">
            <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">
              {TYPE_LABELS[type]}
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {cats.map((cat) => (
                <div
                  key={cat.slug}
                  className="rounded-lg border border-white/[0.06] bg-white/[0.03] p-3 space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-zinc-200">{cat.category}</span>
                    <span className="text-xs font-bold text-teal-400">{fmt(cat.subtotal)}</span>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {cat.items.map((item, i) => (
                      <span
                        key={i}
                        className="inline-flex items-center rounded-full bg-white/[0.06] px-2 py-0.5 text-[10px] text-zinc-400"
                      >
                        {item.name}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
