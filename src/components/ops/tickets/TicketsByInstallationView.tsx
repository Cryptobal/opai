"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { Loader2 } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  InstallationTicketCard,
  type InstallationRow,
} from "./InstallationTicketCard";

const TicketsByInstallationMap = dynamic(
  () => import("./TicketsByInstallationMap").then((m) => m.TicketsByInstallationMap),
  { ssr: false, loading: () => <div className="flex h-[560px] items-center justify-center rounded-lg border border-white/10"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div> },
);

type SortBy = "criticality" | "total" | "p1" | "breached" | "name";
type DisplayMode = "grid" | "map";

interface Props {
  originTab: "all" | "internal" | "guard" | "client";
  onSelectInstallation: (id: string, name: string, total: number) => void;
  externalSearch?: string;
}

const SORT_OPTIONS: Array<{ value: SortBy; label: string }> = [
  { value: "criticality", label: "Criticidad" },
  { value: "total", label: "Total activos" },
  { value: "p1", label: "P1" },
  { value: "breached", label: "SLA vencidos" },
  { value: "name", label: "Alfabético A–Z" },
];

export function TicketsByInstallationView({
  originTab,
  onSelectInstallation,
  externalSearch,
}: Props) {
  const [rows, setRows] = useState<InstallationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState<SortBy>("criticality");
  const [onlyWithActive, setOnlyWithActive] = useState(true);
  const [displayMode, setDisplayMode] = useState<DisplayMode>("grid");

  // Search comes from the parent toolbar (single global search bar).
  const debouncedSearch = (externalSearch ?? "").trim().toLowerCase();

  const fetchRows = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        sortBy,
        onlyWithActive: String(onlyWithActive),
      });
      if (originTab !== "all") params.set("type", originTab);
      const res = await fetch(`/api/ops/tickets/by-installation?${params}`);
      const data = await res.json();
      if (data.success) setRows(data.data.installations);
    } finally {
      setLoading(false);
    }
  }, [originTab, sortBy, onlyWithActive]);

  useEffect(() => {
    fetchRows();
  }, [fetchRows]);

  const visibleRows = useMemo(() => {
    if (!debouncedSearch) return rows;
    return rows.filter((r) =>
      r.installationName.toLowerCase().includes(debouncedSearch) ||
      (r.clientName ?? "").toLowerCase().includes(debouncedSearch),
    );
  }, [rows, debouncedSearch]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortBy)}>
          <SelectTrigger className="h-8 w-[180px] text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SORT_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={onlyWithActive}
            onChange={(e) => setOnlyWithActive(e.target.checked)}
            className="h-3.5 w-3.5"
          />
          Solo con tickets abiertos
        </label>

        <div className="ml-auto flex gap-1 rounded-md bg-muted p-0.5">
          {([
            { value: "grid" as const, label: "Grid" },
            { value: "map" as const, label: "Mapa" },
          ]).map((m) => (
            <button
              key={m.value}
              type="button"
              onClick={() => setDisplayMode(m.value)}
              className={`rounded-sm px-2 py-1 text-[10px] font-medium ${
                displayMode === m.value ? "bg-background shadow-sm" : "text-muted-foreground"
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : visibleRows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-white/10 py-12 text-center text-sm text-muted-foreground">
          No hay instalaciones que coincidan.
        </div>
      ) : displayMode === "map" ? (
        <TicketsByInstallationMap
          rows={visibleRows}
          onSelect={onSelectInstallation}
        />
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {visibleRows.map((row) => (
            <InstallationTicketCard
              key={row.installationId}
              row={row}
              onClick={(id) =>
                onSelectInstallation(id, row.installationName, row.totalActive)
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}
