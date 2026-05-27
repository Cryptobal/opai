"use client";
import { Building2 } from "lucide-react";

interface Props {
  clientName: string;
  installationCount: number;
  monthlyAmountLabel: string | null;
  colSpan: number;
}

export function ClientGroupHeader({
  clientName,
  installationCount,
  monthlyAmountLabel,
  colSpan,
}: Props) {
  return (
    <tr className="bg-muted/20">
      <td
        colSpan={colSpan}
        className="sticky left-0 z-20 bg-muted/20 px-3 py-1.5 border-t border-border/50"
      >
        <div className="flex items-center gap-2 text-[11px]">
          <Building2 className="h-3 w-3 text-ds-text-3 shrink-0" aria-hidden="true" />
          <span className="font-mono font-medium text-ds-text-2 uppercase tracking-[0.04em]">
            {clientName}
          </span>
          <span className="text-ds-text-3">
            · {installationCount} instalaci{installationCount === 1 ? "ón" : "ones"}
            {monthlyAmountLabel ? ` · ${monthlyAmountLabel}` : ""}
          </span>
        </div>
      </td>
    </tr>
  );
}
