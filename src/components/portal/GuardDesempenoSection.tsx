"use client";

import React, { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import {
  BarChart3,
  Trophy,
  Award,
  Target,
  Heart,
  Gift,
  TrendingUp,
  TrendingDown,
  Minus,
  CheckCircle2,
  Loader2,
  Send,
} from "lucide-react";
import { ChipTabs, type ChipTab } from "@/components/ui/chip-tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState, LoadingState } from "@/components/opai-ds";
import {
  TrustScoreGauge,
  NivelBadge,
  StreakCounter,
  DimensionBreakdown,
  BadgeGrid,
  PointsHistory,
  TrendChart,
  type GuardiaScorecard,
  type BadgeData,
  type PointEvent,
  type RankingEntry,
  type DesafioData,
  type BeneficioData,
  type FeedItem,
  type TrendPoint,
  NIVEL_CONFIG,
} from "@/components/gamification";
import type { GuardSession } from "@/lib/guard-portal";

// ═══════════════════════════════════════════════════════════════
//  SUB-TAB DEFINITIONS
// ═══════════════════════════════════════════════════════════════

const SUB_TABS: ChipTab[] = [
  { id: "scorecard", label: "Mi Score", icon: BarChart3 },
  { id: "ranking", label: "Ranking", icon: Trophy },
  { id: "badges", label: "Badges", icon: Award },
  { id: "desafios", label: "Desafios", icon: Target },
  { id: "reconocimiento", label: "Social", icon: Heart },
  { id: "beneficios", label: "Beneficios", icon: Gift },
];

// ═══════════════════════════════════════════════════════════════
//  MAIN SECTION COMPONENT
// ═══════════════════════════════════════════════════════════════

export function GuardDesempenoSection({ session }: { session: GuardSession }) {
  const [activeTab, setActiveTab] = useState("scorecard");

  return (
    <div className="px-4 py-4 pb-24 space-y-4">
      <ChipTabs
        tabs={SUB_TABS}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        centered={false}
      />

      {activeTab === "scorecard" && <ScorecardView session={session} />}
      {activeTab === "ranking" && <RankingView session={session} />}
      {activeTab === "badges" && <BadgesView session={session} />}
      {activeTab === "desafios" && <DesafiosView session={session} />}
      {activeTab === "reconocimiento" && <ReconocimientoView session={session} />}
      {activeTab === "beneficios" && <BeneficiosView session={session} />}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
//  SCORECARD VIEW
// ═══════════════════════════════════════════════════════════════

function ScorecardView({ session }: { session: GuardSession }) {
  const [scorecard, setScorecard] = useState<GuardiaScorecard | null>(null);
  const [historial, setHistorial] = useState<PointEvent[]>([]);
  const [tendencia, setTendencia] = useState<TrendPoint[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [scRes, hiRes, trRes] = await Promise.all([
          fetch(`/api/portal/guardia/gamification/scorecard?guardiaId=${session.guardiaId}`),
          fetch(`/api/portal/guardia/gamification/historial?guardiaId=${session.guardiaId}&limit=10`),
          fetch(`/api/portal/guardia/gamification/tendencia?guardiaId=${session.guardiaId}`),
        ]);

        if (scRes.ok && !cancelled) {
          const d = await scRes.json();
          if (d.success && d.data) {
            const raw = d.data;
            // Map API flat response to GuardiaScorecard shape
            const dimensiones: import("@/components/gamification").DimensionScore[] = [
              { dimension: "rondas", label: "Rondas", score: raw.scoreRondas ?? 0, peso: 30, color: "text-status-info-fg" },
              { dimension: "asistencia", label: "Asistencia", score: raw.scoreAsistencia ?? 0, peso: 25, color: "text-status-info-fg" },
              { dimension: "sistema_digital", label: "Sistema Digital", score: raw.scoreSistemaDigital ?? 0, peso: 15, color: "text-tint-violet-fg" },
              { dimension: "supervision", label: "Supervisión", score: raw.scoreSupervision ?? 0, peso: 15, color: "text-status-warn-fg" },
              { dimension: "capacitacion", label: "Capacitación", score: raw.scoreCapacitacion ?? 0, peso: 15, color: "text-status-warn-fg" },
            ];
            const mapped: GuardiaScorecard = {
              guardiaId: session.guardiaId,
              nombre: `${session.firstName} ${session.lastName}`,
              trustScore: raw.trustScore ?? 0,
              nivel: typeof raw.nivelActual === "object" ? (raw.nivelActual?.name ?? "centinela") : (raw.nivelActual ?? raw.nivel ?? "centinela"),
              puntosMes: raw.puntosNetosMes ?? raw.puntosGanadosMes ?? raw.puntosMes ?? 0,
              rachaActual: raw.rachaActual ?? 0,
              rankingInstalacion: raw.rankingInstalacion ?? 0,
              totalGuardiasInstalacion: raw.totalGuardiasInstalacion ?? 0,
              percentil: raw.percentil ?? (raw.rankingInstalacion && raw.totalGuardiasInstalacion
                ? Math.round(((raw.totalGuardiasInstalacion - raw.rankingInstalacion) / raw.totalGuardiasInstalacion) * 100)
                : 0),
              tendenciaMesAnterior: raw.tendenciaMesAnterior ?? 0,
              dimensiones,
            };
            setScorecard(mapped);
          }
        }
        if (hiRes.ok && !cancelled) {
          const d = await hiRes.json();
          if (d.success) setHistorial(d.data?.eventos ?? d.data ?? []);
        }
        if (trRes.ok && !cancelled) {
          const d = await trRes.json();
          if (d.success) setTendencia(d.data?.puntos ?? d.data ?? []);
        }
      } catch {
        /* ignore */
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [session.guardiaId]);

  if (loading) return <LoadingState text="Cargando scorecard..." />;
  if (!scorecard) return <EmptyState
    icon={<TrendingUp className="h-8 w-8" />}
    title="Sin datos de desempeno"
    description="Aun no hay informacion de gamificacion disponible."
    compact
  />;

  // Level progression
  const nivelKeys = Object.keys(NIVEL_CONFIG);
  const currentIdx = nivelKeys.indexOf(scorecard.nivel.toLowerCase());
  const levelProgress = currentIdx >= 0 ? ((currentIdx + 1) / nivelKeys.length) * 100 : 0;

  const tendenciaDiff = scorecard.tendenciaMesAnterior;

  return (
    <div className="space-y-4">
      {/* Hero Card */}
      <Card>
        <CardContent className="flex flex-col items-center py-6 gap-3">
          <TrustScoreGauge score={scorecard.trustScore} size="lg" />
          <NivelBadge nivel={scorecard.nivel} />

          {/* Level progression bar */}
          <div className="w-full max-w-[200px] space-y-1">
            <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-status-info transition-all duration-500"
                style={{ width: `${levelProgress}%` }}
              />
            </div>
            <p className="text-[11px] text-center text-muted-foreground">
              Nivel {currentIdx + 1} de {nivelKeys.length}
            </p>
          </div>

          <StreakCounter days={scorecard.rachaActual} size="lg" />
        </CardContent>
      </Card>

      {/* KPI Grid (2x2) */}
      <div className="grid grid-cols-2 gap-3">
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-lg font-bold tabular-nums text-status-info-fg">{scorecard.puntosMes}</p>
            <p className="text-[11px] uppercase text-muted-foreground tracking-wide">Puntos del mes</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-lg font-bold tabular-nums text-status-info-fg">
              #{scorecard.rankingInstalacion} <span className="text-sm font-normal text-muted-foreground">de {scorecard.totalGuardiasInstalacion}</span>
            </p>
            <p className="text-[11px] uppercase text-muted-foreground tracking-wide">Ranking</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-lg font-bold tabular-nums text-status-warn-fg">{scorecard.percentil}%</p>
            <p className="text-[11px] uppercase text-muted-foreground tracking-wide">Percentil</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <p className={`text-lg font-bold tabular-nums ${tendenciaDiff >= 0 ? "text-status-ok-fg" : "text-status-danger-fg"}`}>
              {tendenciaDiff >= 0 ? "+" : ""}{tendenciaDiff}
            </p>
            <p className="text-[11px] uppercase text-muted-foreground tracking-wide">Tendencia</p>
          </CardContent>
        </Card>
      </div>

      {/* Dimension Breakdown */}
      <Card>
        <CardContent className="p-4">
          <h3 className="text-sm font-semibold mb-3">Dimensiones</h3>
          <DimensionBreakdown dimensiones={scorecard.dimensiones} compact />
        </CardContent>
      </Card>

      {/* Trend Chart */}
      {tendencia.length > 1 && (
        <Card>
          <CardContent className="p-4">
            <h3 className="text-sm font-semibold mb-3">Tendencia</h3>
            <TrendChart data={tendencia} height={180} />
          </CardContent>
        </Card>
      )}

      {/* Recent Activity */}
      <Card>
        <CardContent className="p-4">
          <h3 className="text-sm font-semibold mb-3">Actividad reciente</h3>
          <PointsHistory events={historial} compact showFilter={false} pageSize={10} />
        </CardContent>
      </Card>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
//  RANKING VIEW
// ═══════════════════════════════════════════════════════════════

function RankingView({ session }: { session: GuardSession }) {
  const [ranking, setRanking] = useState<RankingEntry[]>([]);
  const [miPosicion, setMiPosicion] = useState<RankingEntry | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch(`/api/portal/guardia/gamification/ranking?guardiaId=${session.guardiaId}`);
        if (res.ok && !cancelled) {
          const d = await res.json();
          if (d.success) {
            setRanking(d.data?.ranking ?? []);
            setMiPosicion(d.data?.miPosicion ?? null);
          }
        }
      } catch {
        /* ignore */
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [session.guardiaId]);

  if (loading) return <LoadingState text="Cargando ranking..." />;
  if (ranking.length === 0) return <EmptyState
    icon={<BarChart3 className="h-8 w-8" />}
    title="Sin datos de ranking"
    description="No hay datos de ranking disponibles."
    compact
  />;

  return (
    <div className="space-y-4">
      {/* My position card */}
      {miPosicion && (
        <Card className="border-status-info-border">
          <CardContent className="p-4 flex items-center gap-4">
            <div className="text-center">
              <p className="text-3xl font-bold tabular-nums text-status-info-fg">#{miPosicion.posicion}</p>
              <p className="text-[11px] text-muted-foreground">Tu posicion</p>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-base font-semibold">Trust Score: {miPosicion.trustScore}</p>
              <p className="text-sm text-muted-foreground">{miPosicion.puntosMes} puntos este mes</p>
              <NivelBadge nivel={miPosicion.nivel} className="mt-1" />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Ranking list */}
      <div className="space-y-2">
        {ranking.map((entry, idx) => {
          const isMe = entry.esYo === true;
          const TrendIcon = entry.tendencia === "up" ? TrendingUp : entry.tendencia === "down" ? TrendingDown : Minus;
          const trendColor = entry.tendencia === "up" ? "text-status-ok-fg" : entry.tendencia === "down" ? "text-status-danger-fg" : "text-muted-foreground";

          return (
            <Card key={idx} className={isMe ? "bg-status-info-soft/30 border-status-info-border" : ""}>
              <CardContent className="p-3 flex items-center gap-3">
                {/* Position */}
                <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center shrink-0">
                  <span className="text-sm font-bold tabular-nums">{entry.posicion}</span>
                </div>

                {/* Name */}
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-semibold truncate ${isMe ? "text-status-info-fg" : ""}`}>
                    {isMe ? "Tu" : entry.anonimo ? "Anonimo" : entry.nombre ?? "Anonimo"}
                  </p>
                  <p className="text-xs text-muted-foreground tabular-nums">
                    {entry.puntosMes} pts &middot; Score {entry.trustScore}
                  </p>
                </div>

                {/* Trend */}
                <TrendIcon className={`h-4 w-4 shrink-0 ${trendColor}`} />
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
//  BADGES VIEW
// ═══════════════════════════════════════════════════════════════

function BadgesView({ session }: { session: GuardSession }) {
  const [badges, setBadges] = useState<BadgeData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch(`/api/portal/guardia/gamification/badges?guardiaId=${session.guardiaId}`);
        if (res.ok && !cancelled) {
          const d = await res.json();
          if (d.success) setBadges(d.data?.badges ?? d.data ?? []);
        }
      } catch {
        /* ignore */
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [session.guardiaId]);

  if (loading) return <LoadingState text="Cargando badges..." />;
  if (badges.length === 0) return <EmptyState icon={<Award className="h-8 w-8" />} title="Sin badges" description="Completa desafios y mejora tu desempeno para desbloquear badges." compact />;

  return (
    <div className="space-y-4">
      <BadgeGrid badges={badges} compact />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
//  DESAFIOS VIEW
// ═══════════════════════════════════════════════════════════════

function DesafiosView({ session }: { session: GuardSession }) {
  const [desafios, setDesafios] = useState<DesafioData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch(`/api/portal/guardia/gamification/desafios?guardiaId=${session.guardiaId}`);
        if (res.ok && !cancelled) {
          const d = await res.json();
          if (d.success) setDesafios(d.data?.desafios ?? d.data ?? []);
        }
      } catch {
        /* ignore */
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [session.guardiaId]);

  if (loading) return <LoadingState text="Cargando desafios..." />;
  if (desafios.length === 0) return <EmptyState icon={<Target className="h-8 w-8" />} title="Sin desafios activos" description="No hay desafios disponibles en este momento." compact />;

  return (
    <div className="space-y-3">
      {desafios.map((d) => {
        const isCompleted = d.completado === true;
        const progress = d.progresoPersonal ?? 0;
        const startDate = new Date(d.fechaInicio).toLocaleDateString("es-CL", { day: "2-digit", month: "short" });
        const endDate = new Date(d.fechaFin).toLocaleDateString("es-CL", { day: "2-digit", month: "short" });

        return (
          <Card key={d.id}>
            <CardContent className="p-4 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold truncate">{d.nombre}</p>
                    {isCompleted && <CheckCircle2 className="h-4 w-4 text-status-ok-fg shrink-0" />}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{d.descripcion}</p>
                </div>
                <Badge variant="secondary" className="text-[10px] shrink-0">
                  +{d.recompensaPuntos} pts
                </Badge>
              </div>

              <p className="text-[11px] text-muted-foreground">
                {startDate} &ndash; {endDate}
              </p>

              {!isCompleted && (
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                    <span>Progreso</span>
                    <span className="tabular-nums">{Math.round(progress)}%</span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-status-info transition-all duration-500"
                      style={{ width: `${Math.min(progress, 100)}%` }}
                    />
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
//  RECONOCIMIENTO VIEW (Social)
// ═══════════════════════════════════════════════════════════════

const RECONOCIMIENTO_CATEGORIAS = [
  "companerismo",
  "puntualidad",
  "profesionalismo",
  "liderazgo",
  "iniciativa",
];

const CATEGORIA_LABELS: Record<string, string> = {
  companerismo: "Companerismo",
  puntualidad: "Puntualidad",
  profesionalismo: "Profesionalismo",
  liderazgo: "Liderazgo",
  iniciativa: "Iniciativa",
};

function ReconocimientoView({ session }: { session: GuardSession }) {
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [companeros, setCompaneros] = useState<Array<{ id: string; nombre: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);

  // Form state
  const [selectedCompanero, setSelectedCompanero] = useState("");
  const [selectedCategoria, setSelectedCategoria] = useState("");
  const [mensaje, setMensaje] = useState("");
  const [sending, setSending] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(`/api/portal/guardia/gamification/feed?guardiaId=${session.guardiaId}`);
      if (res.ok) {
        const d = await res.json();
        if (d.success) {
          setFeed(d.data?.feed ?? []);
          setCompaneros(d.data?.companeros ?? []);
        }
      }
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, [session.guardiaId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedCompanero || !selectedCategoria) return;

    setSending(true);
    try {
      const res = await fetch("/api/portal/guardia/gamification/reconocimiento", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          guardiaOrigenId: session.guardiaId,
          guardiaDestinoId: selectedCompanero,
          categoria: selectedCategoria,
          mensaje: mensaje.trim() || undefined,
        }),
      });

      if (res.ok) {
        toast.success("Reconocimiento enviado");
        setShowForm(false);
        setSelectedCompanero("");
        setSelectedCategoria("");
        setMensaje("");
        setLoading(true);
        fetchData();
      } else {
        const d = await res.json();
        toast.error(d.error ?? "Error al enviar reconocimiento");
      }
    } catch {
      toast.error("Error de conexion");
    } finally {
      setSending(false);
    }
  }

  if (loading) return <LoadingState text="Cargando feed social..." />;

  return (
    <div className="space-y-4">
      {/* Send recognition button / form */}
      <Button
        onClick={() => setShowForm(!showForm)}
        variant={showForm ? "outline" : "default"}
        className="w-full h-12 text-base"
      >
        {showForm ? "Cancelar" : (
          <>
            <Heart className="h-4 w-4 mr-2" />
            Enviar reconocimiento
          </>
        )}
      </Button>

      {showForm && (
        <Card>
          <CardContent className="p-4">
            <form onSubmit={handleSend} className="space-y-4">
              {/* Companero select */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Companero</label>
                <select
                  value={selectedCompanero}
                  onChange={(e) => setSelectedCompanero(e.target.value)}
                  className="flex h-12 w-full rounded-md border border-input bg-background px-3 py-2 text-base text-foreground ring-offset-background focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  <option value="">Selecciona un companero...</option>
                  {companeros.map((c) => (
                    <option key={c.id} value={c.id}>{c.nombre}</option>
                  ))}
                </select>
              </div>

              {/* Category chips */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Categoria</label>
                <div className="flex flex-wrap gap-2">
                  {RECONOCIMIENTO_CATEGORIAS.map((cat) => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setSelectedCategoria(cat)}
                      className={`rounded-full px-4 py-2 text-sm font-medium transition-colors min-h-[44px] ${
                        selectedCategoria === cat
                          ? "bg-status-info text-white"
                          : "bg-muted text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {CATEGORIA_LABELS[cat] ?? cat}
                    </button>
                  ))}
                </div>
              </div>

              {/* Message textarea */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Mensaje (opcional)</label>
                <textarea
                  rows={3}
                  value={mensaje}
                  onChange={(e) => setMensaje(e.target.value)}
                  placeholder="Escribe un mensaje..."
                  className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-base text-foreground ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none"
                />
              </div>

              {/* Actions */}
              <div className="flex gap-3">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowForm(false)}
                  className="flex-1 h-12"
                >
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  disabled={sending || !selectedCompanero || !selectedCategoria}
                  className="flex-1 h-12"
                >
                  {sending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <>
                      <Send className="h-4 w-4 mr-2" />
                      Enviar
                    </>
                  )}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Feed */}
      {feed.length === 0 ? (
        <EmptyState
          icon={<Heart className="h-8 w-8" />}
          title="Sin actividad social"
          description="Se el primero en enviar un reconocimiento a un companero."
          compact
        />
      ) : (
        <div className="space-y-2">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Feed</h3>
          {feed.map((item) => (
            <Card key={item.id}>
              <CardContent className="p-3 flex items-start gap-3">
                {item.icono && (
                  <span className="text-xl shrink-0">{item.icono}</span>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm">{item.texto}</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    {new Date(item.fecha).toLocaleDateString("es-CL", {
                      day: "2-digit",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
//  BENEFICIOS VIEW
// ═══════════════════════════════════════════════════════════════

function BeneficiosView({ session }: { session: GuardSession }) {
  const [beneficios, setBeneficios] = useState<BeneficioData[]>([]);
  const [puntosDisponibles, setPuntosDisponibles] = useState(0);
  const [loading, setLoading] = useState(true);
  const [canjeandoId, setCanjeandoId] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(`/api/portal/guardia/gamification/beneficios?guardiaId=${session.guardiaId}`);
      if (res.ok) {
        const d = await res.json();
        if (d.success) {
          setBeneficios(d.data?.beneficios ?? []);
          setPuntosDisponibles(d.data?.puntosDisponibles ?? 0);
        }
      }
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, [session.guardiaId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  async function handleCanjear(beneficioId: string) {
    setCanjeandoId(beneficioId);
    try {
      const res = await fetch("/api/portal/guardia/gamification/canjear", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          guardiaId: session.guardiaId,
          beneficioId,
        }),
      });

      if (res.ok) {
        toast.success("Beneficio canjeado exitosamente");
        setLoading(true);
        fetchData();
      } else {
        const d = await res.json();
        toast.error(d.error ?? "Error al canjear beneficio");
      }
    } catch {
      toast.error("Error de conexion");
    } finally {
      setCanjeandoId(null);
    }
  }

  if (loading) return <LoadingState text="Cargando beneficios..." />;

  return (
    <div className="space-y-4">
      {/* Points available card */}
      <Card className="border-status-info-border">
        <CardContent className="p-4 text-center">
          <p className="text-[11px] uppercase text-muted-foreground tracking-wide mb-1">Puntos disponibles</p>
          <p className="text-3xl font-bold tabular-nums text-status-info-fg">{puntosDisponibles}</p>
        </CardContent>
      </Card>

      {/* Benefits list */}
      {beneficios.length === 0 ? (
        <EmptyState
          icon={<Gift className="h-8 w-8" />}
          title="Sin beneficios disponibles"
          description="Los beneficios se habilitaran proximamente."
          compact
        />
      ) : (
        <div className="space-y-3">
          {beneficios.map((b) => {
            const canAfford = puntosDisponibles >= b.costoPuntos;
            const isCanjando = canjeandoId === b.id;

            return (
              <Card key={b.id}>
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold">{b.nombre}</p>
                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{b.descripcion}</p>
                    </div>
                    <Badge variant="secondary" className="text-[10px] shrink-0">{b.categoria}</Badge>
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="text-xs text-muted-foreground">
                      <span>{b.proveedor}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold tabular-nums text-status-info-fg">{b.costoPuntos} pts</span>
                      <Button
                        size="sm"
                        disabled={!canAfford || !b.disponible || isCanjando}
                        onClick={() => handleCanjear(b.id)}
                        className="min-h-[44px] px-4"
                      >
                        {isCanjando ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          "Canjear"
                        )}
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
