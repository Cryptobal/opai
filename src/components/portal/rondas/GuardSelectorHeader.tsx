"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { ChevronDown, Loader2, MapPin, UserCircle } from "lucide-react";

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
  const dropdownRef = useRef<HTMLDivElement>(null);

  const fetchGuards = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/devices/guards", {
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
    fetchGuards();
  }, [fetchGuards]);

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
    if (!open) fetchGuards();
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
    <div className="sticky top-0 z-10 bg-gray-900/95 backdrop-blur-sm border-b border-white/5 px-4 py-2.5 opai-ios-surface-sheet-top">
      <div className="flex items-center gap-2 mb-1">
        <MapPin className="h-3.5 w-3.5 text-status-info-fg shrink-0" />
        <span className="text-xs text-status-info-fg truncate font-medium">
          {installationName}
        </span>
      </div>

      <div ref={dropdownRef} className="relative">
        <button
          type="button"
          onClick={handleToggle}
          disabled={setting}
          className={`w-full flex items-center justify-between gap-2 h-9 rounded-lg px-3 text-sm transition-colors ${
            noGuard
              ? "border border-amber-500/60 bg-status-warn-soft text-status-warn-fg"
              : "border border-white/10 bg-white/5 text-white"
          }`}
        >
          <span className="flex items-center gap-2 truncate">
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
          <div className="absolute left-0 right-0 top-full mt-1 max-h-60 overflow-y-auto rounded-lg border border-white/10 bg-gray-800 shadow-xl z-20">
            {loading && guards.length === 0 ? (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="h-5 w-5 animate-spin text-zinc-400" />
              </div>
            ) : guards.length === 0 ? (
              <p className="text-xs text-zinc-500 text-center py-3">
                No hay guardias asignados
              </p>
            ) : (
              guards.map((g) => (
                <button
                  key={g.id}
                  type="button"
                  onClick={() => handleSelect(g)}
                  className={`w-full text-left px-3 py-2.5 text-sm transition-colors hover:bg-white/5 ${
                    g.id === currentGuardId
                      ? "text-status-info-fg bg-teal-400/5"
                      : "text-zinc-200"
                  }`}
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="truncate">{g.name}</span>
                    {g.isTurnoExtra && (
                      <span className="shrink-0 rounded-full bg-status-warn-soft px-1.5 py-0.5 text-[10px] font-medium text-status-warn-fg">
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
