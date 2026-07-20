"use client";

import { Tag } from "@/components/opai-ds";

export type LicRow = {
  id: string;
  title: string;
  accountName: string | null;
  amount: number;
  ownerName: string | null;
  daysLeft: number;
  syncStatus: string | null;
};

type Props = {
  items: LicRow[];
  onSelect?: (id: string) => void;
};

export function LicitacionesList({ items, onSelect }: Props) {
  if (items.length === 0) {
    return <p className="text-[13px] text-ds-text-3">No hay licitaciones abiertas en carpeta.</p>;
  }
  return (
    <ul className="divide-y divide-ds-border-subtle rounded-xl border border-ds-border-subtle">
      {items.map((i) => (
        <li key={i.id}>
          <button
            type="button"
            onClick={() => onSelect?.(i.id)}
            className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left ds-tap"
          >
            <div className="min-w-0">
              <p className="truncate text-[13px] font-medium text-ds-text-1">{i.title}</p>
              <p className="truncate text-[12px] text-ds-text-4">
                {i.accountName} · {i.ownerName || "Sin owner"} · $
                {i.amount.toLocaleString("es-CL")}
              </p>
            </div>
            <Tag
              size="sm"
              variant={i.daysLeft <= 3 ? "danger" : i.daysLeft <= 7 ? "warn" : "neutral"}
            >
              T-{i.daysLeft}
            </Tag>
          </button>
        </li>
      ))}
    </ul>
  );
}
