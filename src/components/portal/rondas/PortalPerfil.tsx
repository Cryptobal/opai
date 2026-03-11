"use client";

import { useEffect, useState } from "react";
import { LogOut, Shield, MapPin, User, Flame, Trophy } from "lucide-react";
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
  if (score >= 80) return "text-emerald-400";
  if (score >= 60) return "text-yellow-400";
  return "text-red-400";
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
    <div className="flex flex-1 min-h-0 flex-col overflow-y-auto bg-[#0a0a0f] pb-24">
      {/* Header */}
      <header className="sticky top-0 z-10 border-b border-gray-800 bg-[#0a0a0f]/90 px-4 py-4 backdrop-blur-sm">
        <h1 className="text-lg font-semibold text-white">Mi Perfil</h1>
      </header>

      <div className="flex-1 space-y-6 px-4 pt-6">
        {/* Avatar */}
        <div className="flex flex-col items-center gap-3">
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-teal-900/40 ring-2 ring-teal-600/30">
            <User className="h-10 w-10 text-teal-400" />
          </div>
          <h2 className="text-xl font-semibold text-white">{session.nombre}</h2>
        </div>

        {/* Info cards */}
        <div className="space-y-3">
          <div className="flex items-center gap-3 rounded-xl bg-gray-900/50 px-4 py-3">
            <MapPin className="h-5 w-5 text-gray-400" />
            <div>
              <p className="text-xs text-gray-500">Instalacion</p>
              <p className="text-sm text-gray-200">{session.installationName}</p>
            </div>
          </div>

          <div className="flex items-center gap-3 rounded-xl bg-gray-900/50 px-4 py-3">
            <Shield className="h-5 w-5 text-gray-400" />
            <div>
              <p className="text-xs text-gray-500">Estado</p>
              <p className="text-sm text-teal-400">Sesion activa</p>
            </div>
          </div>
        </div>

        {/* ----------------------------------------------------------------- */}
        {/* Performance stats                                                 */}
        {/* ----------------------------------------------------------------- */}
        <div>
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-gray-400">
            Desempeno del mes
          </h3>

          {loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-gray-600 border-t-teal-400" />
            </div>
          ) : stats ? (
            <div className="grid grid-cols-2 gap-3">
              {/* Completadas */}
              <div className="rounded-xl bg-gray-900/50 px-4 py-3 text-center">
                <p className="text-2xl font-bold text-white">{stats.completadas}</p>
                <p className="text-xs text-gray-400">
                  Completadas{" "}
                  <span className="text-gray-500">de {stats.total}</span>
                </p>
              </div>

              {/* A tiempo */}
              <div className="rounded-xl bg-gray-900/50 px-4 py-3 text-center">
                <p className="text-2xl font-bold text-emerald-400">
                  {stats.aTiempo}
                </p>
                <p className="text-xs text-gray-400">A tiempo</p>
              </div>

              {/* Con retraso */}
              <div className="rounded-xl bg-gray-900/50 px-4 py-3 text-center">
                <p className="text-2xl font-bold text-yellow-400">
                  {stats.conRetraso}
                </p>
                <p className="text-xs text-gray-400">Con retraso</p>
              </div>

              {/* No realizadas */}
              <div className="rounded-xl bg-gray-900/50 px-4 py-3 text-center">
                <p className="text-2xl font-bold text-red-400">
                  {stats.noRealizadas}
                </p>
                <p className="text-xs text-gray-400">No realizadas</p>
              </div>

              {/* Trust Score */}
              <div className="rounded-xl bg-gray-900/50 px-4 py-3 text-center">
                <p
                  className={`text-2xl font-bold ${trustScoreColor(stats.trustScorePromedio)}`}
                >
                  {stats.trustScorePromedio}
                </p>
                <p className="text-xs text-gray-400">Trust Score</p>
              </div>

              {/* Racha */}
              <div className="rounded-xl bg-gray-900/50 px-4 py-3 text-center">
                <div className="flex items-center justify-center gap-1">
                  <Flame className="h-5 w-5 text-orange-400" />
                  <p className="text-2xl font-bold text-orange-400">
                    {stats.rachaActual}
                  </p>
                </div>
                <p className="text-xs text-gray-400">Racha dias</p>
              </div>
            </div>
          ) : (
            <p className="py-4 text-center text-sm text-gray-500">
              No se pudo cargar el desempeno
            </p>
          )}
        </div>

        {/* ----------------------------------------------------------------- */}
        {/* Gamification placeholder                                          */}
        {/* ----------------------------------------------------------------- */}
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-gray-700 bg-gray-900/30 px-4 py-6">
          <Trophy className="h-8 w-8 text-gray-600" />
          <p className="text-sm text-gray-500">
            Sistema de puntos y rankings — Proximamente
          </p>
        </div>

        {/* Logout */}
        <button
          onClick={onLogout}
          className="mt-8 flex w-full items-center justify-center gap-2 rounded-xl border border-red-800/50 bg-red-950/20 py-3.5 text-base font-medium text-red-400 transition-colors hover:bg-red-950/40 active:bg-red-900/30"
        >
          <LogOut className="h-5 w-5" />
          Cerrar sesion
        </button>
      </div>
    </div>
  );
}
