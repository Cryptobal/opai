"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { ChevronDown, Loader2, MapPin, Search, UserCircle } from "lucide-react";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";

interface Guard {
  id: string;
  name: string;
  isTurnoExtra?: boolean;
}

interface Props {
  installationName: string;
  deviceToken: string;
  currentGuardId: string | null;
  currentGuardName: string | null;
  onGuardChange: (guard: Guard | null) => void;
}

export function GuardSelectorHeader({
  installationName,
  deviceToken,
  currentGuardId,
  currentGuardName,
  onGuardChange,
}: Props) {
  const [guards, setGuards] = useState<Guard[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [setting, setSetting] = useState(false);
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebouncedValue(query, 300);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const fetchGuards = useCallback(async (search = "") => {
    setLoading(true);
    try {
      const q = search.trim();
      const url = q.length >= 2
        ? `/api/devices/guards?q=${encodeURIComponent(q)}`
        : "/api/devices/guards";
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${deviceToken}` },
      });
      const json = await res.json();
      if (json.success && Array.isArray(json.data)) {
        setGuards(json.data);
      }
    } catch {
      // Silently fail — will retry on next open
    } finally {
      setLoading(false);
    }
  }, [deviceToken]);

  useEffect(() => {
    fetchGuards(debouncedQuery);
  }, [fetchGuards, debouncedQuery]);

  useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  const handleToggle = () => {
    if (!open) fetchGuards(query);
    setOpen((v) => !v);
  };

  const handleSelect = async (guard: Guard) => {
    setSetting(true);
    try {
      const res = await fetch("/api/devices/set-guard", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${deviceToken}`,
        },
        body: JSON.stringify({ guardId: guard.id }),
      });
      const json = await res.json();
      if (json.success) {
        onGuardChange(guard);
      }
    } catch {
      // Silently fail
    } finally {
      setSetting(false);
      setOpen(false);
    }
  };

  const noGuard = !currentGuardId;

  return (
    <div className="z-10 border-b border-ds-border-subtle bg-ds-surface-1 px-4 py-2">
      <div className="flex items-center gap-2">
        <MapPin className="h-3.5 w-3.5 shrink-0 text-primary" />
        <span className="min-w-0 truncate text-[12px] font-medium text-ds-text-3">
          {installationName}
        </span>
      </div>

      <div ref={dropdownRef} className="relative mt-1.5">
        <button
          type="button"
          onClick={handleToggle}
          disabled={setting}
          className={`flex h-11 w-full items-center justify-between gap-2 rounded-full px-3.5 text-sm font-medium transition-colors ${
            noGuard
              ? "border border-status-warn-border bg-status-warn-soft text-status-warn-fg"
              : "border border-ds-border-default bg-ds-surface-2 text-ds-text-1"
          }`}
        >
          <span className="flex min-w-0 items-center gap-2 truncate">
            <UserCircle className="h-4 w-4 shrink-0 opacity-60" />
            {setting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <span className="truncate">
                {currentGuardName ?? "Selecciona tu nombre"}
              </span>
            )}
          </span>
          <ChevronDown
            className={`h-4 w-4 shrink-0 opacity-60 transition-transform ${open ? "rotate-180" : ""}`}
          />
        </button>

        {open && (
          <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-60 overflow-y-auto rounded-2xl border border-ds-border-default bg-ds-surface-2 shadow-lg">
            <div className="sticky top-0 border-b border-ds-border-subtle bg-ds-surface-2 p-2">
              <label className="relative block">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ds-text-4" />
                <input
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Busca tu nombre"
                  className="h-11 w-full rounded-full border border-ds-border-default bg-ds-surface-1 pl-9 pr-3 text-sm text-ds-text-1 placeholder:text-ds-text-4"
                />
              </label>
            </div>
            {loading && guards.length === 0 ? (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="h-5 w-5 animate-spin text-ds-text-3" />
              </div>
            ) : guards.length === 0 ? (
              <p className="py-3 text-center text-ds-caption text-ds-text-3">
                {query.trim().length >= 2
                  ? "Sin resultados"
                  : "No hay guardias asignados. Busca tu nombre."}
              </p>
            ) : (
              guards.map((g) => (
                <button
                  key={g.id}
                  type="button"
                  onClick={() => handleSelect(g)}
                  className={`w-full px-3 py-2.5 text-left text-sm transition-colors hover:bg-ds-surface-3 ${
                    g.id === currentGuardId
                      ? "bg-status-info-soft/30 text-status-info-fg"
                      : "text-ds-text-1"
                  }`}
                >
                  <span className="flex flex-wrap items-center justify-between gap-2">
                    <span className="break-words">{g.name}</span>
                    {g.isTurnoExtra && (
                      <span className="shrink-0 rounded-full bg-status-warn-soft px-1.5 py-0.5 text-[12px] font-medium text-status-warn-fg">
                        turno extra
                      </span>
                    )}
                  </span>
                </button>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
