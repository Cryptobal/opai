"use client";

import { useEffect, useState } from "react";
import { LogOut, Shield, MapPin, User, Flame } from "lucide-react";
import type { RondasSession } from "./RondasPortalClient";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface GuardStats {
  completadas: number;
  aTiempo: number;
  conRetraso: number;
  noRealizadas: number;
  total: number;
  trustScorePromedio: number;
  rachaActual: number;
}

interface PortalPerfilProps {
  session: RondasSession;
  onLogout: () => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function currentMonthKey(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function trustScoreColor(score: number): string {
  if (score >= 80) return "text-status-ok-fg";
  if (score >= 60) return "text-status-warn-fg";
  return "text-status-danger-fg";
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function PortalPerfil({ session, onLogout }: PortalPerfilProps) {
  const [stats, setStats] = useState<GuardStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function fetchStats() {
      try {
        const mes = currentMonthKey();
        const res = await fetch(
          `/api/portal/rondas/mi-desempeno?guardiaId=${session.guardiaId}&mes=${mes}`
        );
        if (!res.ok) throw new Error("fetch failed");
        const json = (await res.json()) as { success: boolean; data: GuardStats };
        if (!cancelled && json.success) {
          setStats(json.data);
        }
      } catch {
        // silently fail — stats are non-critical
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    fetchStats();
    return () => {
      cancelled = true;
    };
  }, [session.guardiaId]);

  return (
    <div className="flex flex-1 min-h-0 flex-col bg-[#0a0a0f]">
      <div className="flex-1 space-y-4 px-4 pt-5">
        {/* Avatar + Name */}
        <div className="flex flex-col items-center gap-2">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-status-info-soft ring-2 ring-status-info-border">
            <User className="h-7 w-7 text-status-info-fg" />
          </div>
          <h2 className="text-lg font-semibold text-white">{session.nombre}</h2>
        </div>

        {/* Installation + Status — single row */}
        <div className="flex items-center gap-3 rounded-xl bg-gray-900/50 px-4 py-2.5">
          <MapPin className="h-4 w-4 shrink-0 text-gray-400" />
          <p className="flex-1 truncate text-sm text-gray-200">{session.installationName}</p>
          <div className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-status-info" />
            <span className="text-xs text-status-info-fg">Activa</span>
          </div>
        </div>

        {/* Performance stats */}
        <div>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-400">
            Desempeno del mes
          </h3>

          {loading ? (
            <div className="flex items-center justify-center py-6">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-gray-600 border-t-teal-400" />
            </div>
          ) : stats ? (
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-xl bg-gray-900/50 px-3 py-2 text-center">
                <p className="text-xl font-bold text-white">{stats.completadas}</p>
                <p className="text-[10px] text-gray-400">
                  Completadas{" "}
                  <span className="text-gray-500">de {stats.total}</span>
                </p>
              </div>

              <div className="rounded-xl bg-gray-900/50 px-3 py-2 text-center">
                <p className="text-xl font-bold text-status-ok-fg">{stats.aTiempo}</p>
                <p className="text-[10px] text-gray-400">A tiempo</p>
              </div>

              <div className="rounded-xl bg-gray-900/50 px-3 py-2 text-center">
                <p className="text-xl font-bold text-status-warn-fg">{stats.conRetraso}</p>
                <p className="text-[10px] text-gray-400">Con retraso</p>
              </div>

              <div className="rounded-xl bg-gray-900/50 px-3 py-2 text-center">
                <p className="text-xl font-bold text-status-danger-fg">{stats.noRealizadas}</p>
                <p className="text-[10px] text-gray-400">No realizadas</p>
              </div>

              <div className="rounded-xl bg-gray-900/50 px-3 py-2 text-center">
                <p className={`text-xl font-bold ${trustScoreColor(stats.trustScorePromedio)}`}>
                  {stats.trustScorePromedio}
                </p>
                <p className="text-[10px] text-gray-400">Trust Score</p>
              </div>

              <div className="rounded-xl bg-gray-900/50 px-3 py-2 text-center">
                <div className="flex items-center justify-center gap-1">
                  <Flame className="h-4 w-4 text-status-warn-fg" />
                  <p className="text-xl font-bold text-status-warn-fg">{stats.rachaActual}</p>
                </div>
                <p className="text-[10px] text-gray-400">Racha dias</p>
              </div>
            </div>
          ) : (
            <p className="py-4 text-center text-sm text-gray-500">
              No se pudo cargar el desempeno
            </p>
          )}
        </div>

        {/* Logout */}
        <button
          onClick={onLogout}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-status-danger-border bg-status-danger-soft/30 py-2.5 text-sm font-medium text-status-danger-fg transition-colors hover:brightness-110 active:brightness-95"
        >
          <LogOut className="h-4 w-4" />
          Cerrar sesion
        </button>
      </div>
    </div>
  );
}
