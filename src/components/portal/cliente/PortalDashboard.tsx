'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from 'recharts'
import {
  TrendingUp, TrendingDown, Minus, CheckCircle2, AlertTriangle, XCircle,
  Clock, Loader2, BarChart3, MapPin, Star, FileText, Bot, ShieldCheck,
  MessageSquare, ArrowRight,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { ClienteSession } from '@/lib/portal-cliente-types'
import { DEMO_SUMMARY, DEMO_CHART_DATA, DEMO_GUARDIAS_RANKING, DEMO_ACTIVITY } from '@/lib/portal/demo-data'
import { PreviewBadge } from './PreviewBadge'
import { OpaiBadge } from './OpaiBadge'
import { DashboardCotizacionesPendientes } from './cotizaciones/DashboardCotizacionesPendientes'
import { WhatsAppButton } from './cotizaciones/WhatsAppButton'

/* ── Types ── */

interface Summary {
  compliance: number
  complianceTrend: number
  completedRounds: number
  totalRounds: number
  trustScore: number
  trustTrend: number
  alerts: number
  alertsTrend: number
}

interface DailyPoint { date: string; compliance: number; total: number; completed: number }
interface Guard { name: string; rounds: number; trustAvg: number }
interface Activity { id: string; type: string; timestamp: string; icon: string; text: string; detail?: string }

/* ── Helpers ── */

function barColor(pct: number): string {
  if (pct >= 90) return '#22c55e'
  if (pct >= 70) return '#3b82f6'
  return '#f59e0b'
}

const ICON_COLORS: Record<string, string> = {
  green: 'text-emerald-400',
  amber: 'text-amber-400',
  red: 'text-red-400',
  blue: 'text-blue-400',
}

const ICON_COMPONENTS: Record<string, typeof CheckCircle2> = {
  green: CheckCircle2,
  amber: AlertTriangle,
  red: XCircle,
  blue: Clock,
}

function TrendBadge({ value, suffix = '' }: { value: number; suffix?: string }) {
  if (value > 0) return <span className="text-emerald-400 text-[10px] flex items-center gap-0.5"><TrendingUp className="h-3 w-3" /> +{value}{suffix}</span>
  if (value < 0) return <span className="text-red-400 text-[10px] flex items-center gap-0.5"><TrendingDown className="h-3 w-3" /> {value}{suffix}</span>
  return <span className="text-zinc-500 text-[10px] flex items-center gap-0.5"><Minus className="h-3 w-3" /> 0{suffix}</span>
}

function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ payload?: DailyPoint }>; label?: string }) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  return (
    <div className="rounded-lg border border-white/10 bg-zinc-900 px-3 py-2 shadow-xl text-xs">
      <p className="font-medium text-white mb-1">{label}</p>
      <p className="text-zinc-400">Cumplimiento: <span className="text-white font-semibold">{d?.compliance ?? 0}%</span></p>
      <p className="text-zinc-400">{d?.completed ?? 0}/{d?.total ?? 0} completadas</p>
    </div>
  )
}

function KpiCard({ label, value, trend, color }: { label: string; value: string; trend: React.ReactNode; color: string }) {
  const borderCls =
    color === 'emerald' ? 'border-emerald-500/20' :
    color === 'blue' ? 'border-blue-500/20' :
    color === 'red' ? 'border-red-500/20' : 'border-white/10'

  return (
    <div className={cn('rounded-xl border bg-white/[0.02] p-3', borderCls)}>
      <p className="text-[10px] text-zinc-400 uppercase tracking-wider mb-1">{label}</p>
      <p className="text-xl font-bold tabular-nums">{value}</p>
      <div className="mt-1">{trend}</div>
    </div>
  )
}

function trustScoreColor(score: number): string {
  if (score >= 80) return 'text-emerald-400'
  if (score >= 60) return 'text-amber-400'
  return 'text-red-400'
}

const MEDALS = ['🥇', '🥈', '🥉']

/* ── Prospect Capability Cards ── */

const CAPABILITY_CARDS = [
  {
    icon: MapPin,
    title: 'Rondas GPS en vivo',
    desc: 'Ve dónde está tu guardia ahora mismo con verificación por geofencing',
    section: 'rondas',
    color: 'text-emerald-400',
    bg: 'bg-emerald-500/10',
    border: 'border-emerald-500/15',
  },
  {
    icon: Star,
    title: 'Trust Score',
    desc: 'Guardias evaluados con datos reales: asistencia, rondas, capacitación',
    section: 'desempeno',
    color: 'text-amber-400',
    bg: 'bg-amber-500/10',
    border: 'border-amber-500/15',
  },
  {
    icon: FileText,
    title: 'Documentación digital',
    desc: 'Contratos, OS-10, antecedentes — todo en un click',
    section: 'documentacion',
    color: 'text-blue-400',
    bg: 'bg-blue-500/10',
    border: 'border-blue-500/15',
  },
  {
    icon: Bot,
    title: 'IA predictiva',
    desc: 'Protocolos y análisis automáticos con inteligencia artificial',
    section: 'desempeno',
    color: 'text-violet-400',
    bg: 'bg-violet-500/10',
    border: 'border-violet-500/15',
  },
  {
    icon: ShieldCheck,
    title: 'Control de acceso',
    desc: 'QR, lectura de cédula, registro digital en tiempo real',
    section: 'control-acceso',
    color: 'text-sky-400',
    bg: 'bg-sky-500/10',
    border: 'border-sky-500/15',
  },
  {
    icon: MessageSquare,
    title: 'Chat directo',
    desc: 'Habla con tu equipo Gard 24/7 sin salir del portal',
    section: 'chat',
    color: 'text-teal-400',
    bg: 'bg-teal-500/10',
    border: 'border-teal-500/15',
  },
]

/* ── Component ── */

interface Props {
  session: ClienteSession
  selectedInstallation: string
  isProspect?: boolean
  onNavigate?: (section: string) => void
}

export function PortalDashboard({ session, selectedInstallation, isProspect, onNavigate }: Props) {
  const [summary, setSummary] = useState<Summary | null>(null)
  const [compliance, setCompliance] = useState<DailyPoint[]>([])
  const [guards, setGuards] = useState<Guard[]>([])
  const [activity, setActivity] = useState<Activity[]>([])
  const [daysRange, setDaysRange] = useState(30)
  const [loadingData, setLoadingData] = useState(false)

  const fetchDashboard = useCallback(async (instId: string, tenantId: string) => {
    if (isProspect) {
      setSummary({
        compliance: DEMO_SUMMARY.compliance,
        complianceTrend: 2.1,
        completedRounds: DEMO_SUMMARY.completedRounds,
        totalRounds: DEMO_SUMMARY.totalRounds,
        trustScore: DEMO_SUMMARY.trustScore,
        trustTrend: 0.3,
        alerts: DEMO_SUMMARY.alerts,
        alertsTrend: 0,
      })
      setCompliance(
        DEMO_CHART_DATA.map((v, i) => {
          const d = new Date()
          d.setDate(d.getDate() - (DEMO_CHART_DATA.length - 1 - i))
          return { date: d.toISOString().slice(0, 10), compliance: v, total: 28, completed: Math.round(v * 28 / 100) }
        })
      )
      setGuards(
        DEMO_GUARDIAS_RANKING.map(g => ({ name: g.nombre, rounds: Math.round(parseFloat(g.rondas) * 28 / 100), trustAvg: g.score * 10 }))
      )
      setActivity(
        DEMO_ACTIVITY.map((a, i) => ({ id: String(i), type: a.type, timestamp: new Date().toISOString(), icon: a.type === 'alerta' ? 'amber' : 'green', text: a.description }))
      )
      setLoadingData(false)
      return
    }
    if (!instId) return
    setLoadingData(true)
    try {
      const params = `installationId=${encodeURIComponent(instId)}&tenantId=${encodeURIComponent(tenantId)}`
      const [sumRes, compRes, guardRes, actRes] = await Promise.all([
        fetch(`/api/portal/cliente/summary?${params}`),
        fetch(`/api/portal/cliente/compliance?${params}&days=${daysRange}`),
        fetch(`/api/portal/cliente/guards?${params}`),
        fetch(`/api/portal/cliente/activity?${params}`),
      ])
      const [sumJ, compJ, guardJ, actJ] = await Promise.all([sumRes.json(), compRes.json(), guardRes.json(), actRes.json()])
      if (sumJ.success) setSummary(sumJ.data)
      if (compJ.success) setCompliance(compJ.data)
      if (guardJ.success) setGuards(guardJ.data)
      if (actJ.success) setActivity(actJ.data)
    } catch { /* silent */ } finally {
      setLoadingData(false)
    }
  }, [daysRange, isProspect])

  useEffect(() => {
    if (isProspect) {
      void fetchDashboard('', session.tenantId)
    } else if (selectedInstallation) {
      void fetchDashboard(selectedInstallation, session.tenantId)
    }
  }, [selectedInstallation, session.tenantId, fetchDashboard, isProspect])

  const instName = useMemo(
    () => session.installations.find(i => i.id === selectedInstallation)?.name ?? '',
    [session.installations, selectedInstallation],
  )

  const chartData = useMemo(
    () => compliance.slice(-daysRange).map(d => ({
      ...d,
      label: new Date(d.date + 'T12:00:00').toLocaleDateString('es-CL', { day: '2-digit', month: 'short' }),
    })),
    [compliance, daysRange],
  )

  /* ── Prospect Dashboard ── */
  if (isProspect) {
    return (
      <div className="px-4 py-4 pb-24 max-w-6xl mx-auto w-full space-y-6">
        {loadingData && !summary && (
          <div className="flex items-center justify-center py-24">
            <Loader2 className="h-6 w-6 animate-spin text-teal-400" />
          </div>
        )}

        {/* Hero Section */}
        <div className="text-center py-6">
          <h1 className="text-2xl font-bold text-white mb-2">
            {session.firstName ? `Bienvenido, ${session.firstName}` : 'Bienvenido a Gard Security'}
          </h1>
          <p className="text-sm text-zinc-400 mb-3">
            Este es tu centro de comando de seguridad
          </p>
          <p className="text-xs text-zinc-500 max-w-md mx-auto leading-relaxed">
            Gard es la única empresa en Chile con un sistema operativo completo de seguridad.
          </p>
          <div className="mt-3">
            <OpaiBadge text="19 capacidades integradas" />
          </div>
        </div>

        {/* Cotizaciones Carousel */}
        <DashboardCotizacionesPendientes
          isProspect
          onNavigateToDetail={(section) => onNavigate?.(section)}
        />

        {/* Métricas de servicio (demo) */}
        {summary && (
          <>
            <div className="flex items-center gap-2 mb-1">
              <h3 className="text-sm font-semibold">Métricas de servicio</h3>
              <PreviewBadge />
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <KpiCard label="Cumplimiento mensual" value={`${summary.compliance}%`} trend={<TrendBadge value={summary.complianceTrend} suffix="%" />} color="emerald" />
              <KpiCard label="Rondas completadas" value={`${summary.completedRounds}/${summary.totalRounds}`} trend={<span className="text-[10px] text-zinc-500">este mes</span>} color="blue" />
              <KpiCard label="Trust Score promedio" value={String(summary.trustScore)} trend={<TrendBadge value={summary.trustTrend} />} color="blue" />
              <KpiCard label="Alertas del mes" value={String(summary.alerts)} trend={<TrendBadge value={-summary.alertsTrend} />} color={summary.alerts > 5 ? 'red' : 'emerald'} />
            </div>
          </>
        )}

        {/* Preview de capacidades */}
        <div>
          <h3 className="text-sm font-semibold mb-3">Lo que incluye tu servicio con Gard</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {CAPABILITY_CARDS.map((card) => {
              const Icon = card.icon
              return (
                <button
                  key={card.section + card.title}
                  onClick={() => onNavigate?.(card.section)}
                  className={cn(
                    'rounded-xl border p-4 text-left transition-all hover:scale-[1.01] active:scale-[0.99]',
                    card.border, 'bg-white/[0.02]',
                  )}
                >
                  <div className="flex items-start gap-3">
                    <div className={cn('w-10 h-10 rounded-lg flex items-center justify-center shrink-0', card.bg)}>
                      <Icon className={cn('w-5 h-5', card.color)} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-white mb-0.5">{card.title}</p>
                      <p className="text-xs text-zinc-400 leading-relaxed">{card.desc}</p>
                    </div>
                    <ArrowRight className="w-4 h-4 text-zinc-600 shrink-0 mt-1" />
                  </div>
                </button>
              )
            })}
          </div>
        </div>

        {/* Diferenciador final */}
        <div className="rounded-2xl border border-white/[0.06] p-6 text-center" style={{ background: 'linear-gradient(145deg, rgba(30,41,59,0.8), rgba(26,35,50,0.8))' }}>
          <h3 className="text-base font-bold text-white mb-2">
            ¿Por qué ninguna otra empresa tiene esto?
          </h3>
          <p className="text-xs text-zinc-400 max-w-md mx-auto leading-relaxed mb-5">
            Porque Gard desarrolló su propia tecnología. No usamos software genérico.
            OPAI fue diseñado exclusivamente para seguridad privada.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <button
              onClick={() => onNavigate?.('propuesta')}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all active:scale-[0.98]"
              style={{
                background: 'linear-gradient(135deg, #0d9488, #14b8a6, #2dd4bf)',
                color: '#042f2e',
                boxShadow: '0 4px 20px rgba(45,212,191,0.3)',
              }}
            >
              Aprobar mi propuesta
              <ArrowRight className="w-4 h-4" />
            </button>
            <button
              onClick={() => onNavigate?.('chat')}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium border border-zinc-700 text-zinc-300 hover:bg-zinc-800 transition-colors"
            >
              Hablar con mi ejecutivo
            </button>
            <WhatsAppButton variant="compact" />
          </div>
        </div>

        {/* Footer */}
        <footer className="text-center text-xs text-zinc-500 pt-4 pb-8 space-y-1">
          <p>
            Gard Security · Plataforma{' '}
            <span className="font-medium text-zinc-400">OPAI</span> · Desarrollado por{' '}
            <a href="https://lx3.ai" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:text-zinc-300 transition-colors">
              LX3.ai
            </a>
          </p>
        </footer>
      </div>
    )
  }

  /* ── Active Client Dashboard ── */
  return (
    <div className="px-4 py-4 pb-24 max-w-6xl mx-auto w-full">
      {selectedInstallation && instName && (
        <p className="text-sm text-zinc-300 mb-4 font-medium">{instName}</p>
      )}

      {loadingData && !summary && (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="h-6 w-6 animate-spin text-teal-400" />
        </div>
      )}

      <DashboardCotizacionesPendientes
        isProspect={false}
        onNavigateToDetail={(section) => onNavigate?.(section)}
      />

      {summary && (
        <div className="space-y-4">
          {/* KPIs */}
          {summary.totalRounds === 0 && (
            <div className="col-span-full flex flex-col items-center justify-center py-12 text-muted-foreground">
              <BarChart3 className="h-10 w-10 mb-3 opacity-40" />
              <p className="text-sm font-medium">Sin datos operacionales este mes</p>
              <p className="text-xs opacity-60 mt-1">Los datos aparecerán cuando se registren rondas</p>
            </div>
          )}
          {summary.totalRounds > 0 && (
            <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <KpiCard label="Cumplimiento mensual" value={`${summary.compliance}%`} trend={<TrendBadge value={summary.complianceTrend} suffix="%" />} color="emerald" />
            <KpiCard label="Rondas completadas" value={`${summary.completedRounds}/${summary.totalRounds}`} trend={<span className="text-[10px] text-zinc-500">este mes</span>} color="blue" />
            <KpiCard
              label="Trust Score promedio"
              value={String(summary.trustScore)}
              trend={<TrendBadge value={summary.trustTrend} />}
              color={summary.trustScore >= 80 ? 'emerald' : summary.trustScore >= 60 ? 'blue' : 'red'}
            />
            <KpiCard
              label="Alertas del mes"
              value={String(summary.alerts)}
              trend={<TrendBadge value={-summary.alertsTrend} />}
              color={summary.alerts > 5 ? 'red' : 'emerald'}
            />
          </div>

          {/* Chart + Guards */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="lg:col-span-2 rounded-xl border border-white/10 bg-white/[0.02] p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold">Cumplimiento diario</h3>
                <div className="flex gap-1">
                  {[7, 14, 30].map(d => (
                    <button
                      key={d}
                      onClick={() => setDaysRange(d)}
                      className={cn('px-2 py-0.5 rounded text-[10px] font-medium transition-colors',
                        daysRange === d ? 'bg-teal-600 text-white' : 'bg-white/5 text-zinc-400 hover:bg-white/10')}
                    >
                      {d}d
                    </button>
                  ))}
                </div>
              </div>
              <div className="h-[200px]">
                {chartData.length === 0 ? (
                  <div className="flex items-center justify-center h-full text-xs text-zinc-500">Sin datos</div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
                      <XAxis dataKey="label" tick={{ fontSize: 10, fill: 'rgba(255,255,255,0.3)' }} axisLine={false} tickLine={false} />
                      <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: 'rgba(255,255,255,0.3)' }} axisLine={false} tickLine={false} tickFormatter={(v: number) => `${v}%`} />
                      <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(255,255,255,0.02)' }} />
                      <Bar dataKey="compliance" radius={[3, 3, 0, 0]} maxBarSize={24}>
                        {chartData.map(e => <Cell key={e.date} fill={barColor(e.compliance)} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>

            <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
              <div className="flex items-center gap-2 mb-3">
                <h3 className="text-sm font-semibold">Mejores guardias del mes</h3>
                <OpaiBadge text="Trust Score OPAI" variant="default" className="hidden sm:inline-flex" />
              </div>
              {guards.length === 0 ? (
                <p className="text-xs text-zinc-500 py-4 text-center">Sin datos</p>
              ) : (
                <div className="space-y-3">
                  {guards.map((g, i) => (
                    <div key={i} className="flex items-center gap-3">
                      <span className="text-lg">{MEDALS[i] ?? '•'}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{g.name}</p>
                        <p className="text-[10px] text-zinc-400">{g.rounds} rondas · Trust {g.trustAvg}</p>
                      </div>
                      <span className={cn('text-sm font-bold tabular-nums', trustScoreColor(g.trustAvg))}>
                        {g.trustAvg}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Activity */}
          <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
            <h3 className="text-sm font-semibold mb-3">Actividad reciente</h3>
            {activity.length === 0 ? (
              <p className="text-xs text-zinc-500 py-4 text-center">Sin actividad reciente</p>
            ) : (
              <div className="space-y-2">
                {activity.map(a => {
                  const Icon = ICON_COMPONENTS[a.icon] ?? Clock
                  const colorCls = ICON_COLORS[a.icon] ?? 'text-zinc-400'
                  return (
                    <div key={a.id} className="flex items-start gap-3 py-1.5 border-b border-white/5 last:border-0">
                      <span className="text-[10px] text-zinc-500 w-12 shrink-0 tabular-nums pt-0.5">
                        {new Date(a.timestamp).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                      <Icon className={cn('h-4 w-4 shrink-0 mt-0.5', colorCls)} />
                      <div className="min-w-0">
                        <p className="text-sm">{a.text}</p>
                        {a.detail && <p className="text-[10px] text-zinc-400 truncate">{a.detail}</p>}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

            </>
          )}

          {/* Tu ejecutivo */}
          <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
            <h3 className="text-sm font-semibold mb-3">Tu ejecutivo</h3>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-teal-600/30 border border-teal-500/30 flex items-center justify-center">
                <span className="text-sm font-semibold text-teal-300">
                  {session.ejecutivoName ? session.ejecutivoName.charAt(0).toUpperCase() : 'G'}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">{session.ejecutivoName || 'Equipo Gard'}</p>
                <p className="text-xs text-zinc-500">Ejecutivo asignado</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => onNavigate?.('chat')}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-teal-600/20 text-teal-400 hover:bg-teal-600/30 transition-colors"
                >
                  <MessageSquare className="w-3.5 h-3.5" />
                  Chat
                </button>
                <WhatsAppButton variant="compact" />
              </div>
            </div>
          </div>

          {/* Footer */}
          <footer className="text-center text-xs text-zinc-500 pt-4 pb-8 space-y-1">
            <p>
              Estás usando el sistema operativo de seguridad más completo de Chile
            </p>
            <p>
              Gard Security · Plataforma{' '}
              <span className="font-medium text-zinc-400">OPAI</span> · Desarrollado por{' '}
              <a href="https://lx3.ai" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:text-zinc-300 transition-colors">
                LX3.ai
              </a>
            </p>
            <p className="text-[10px]">Última actualización: {new Date().toLocaleString('es-CL')}</p>
          </footer>
        </div>
      )}
    </div>
  )
}
