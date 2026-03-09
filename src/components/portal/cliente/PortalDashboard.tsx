'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from 'recharts'
import {
  TrendingUp, TrendingDown, Minus, CheckCircle2, AlertTriangle, XCircle,
  Clock, Loader2, BarChart3,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { ClienteSession } from '@/lib/portal-cliente'
import { DEMO_SUMMARY, DEMO_CHART_DATA, DEMO_GUARDIAS_RANKING, DEMO_ACTIVITY } from '@/lib/portal/demo-data'
import { PreviewBadge } from './PreviewBadge'
import { ProspectCotizacionCarousel } from './ProspectCotizacionCarousel'

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

const MEDALS = ['🥇', '🥈', '🥉']

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

      {isProspect && (
        <ProspectCotizacionCarousel
          onViewDetail={() => onNavigate?.("propuesta")}
          onChat={() => onNavigate?.("chat")}
        />
      )}

      {summary && (
        <div className="space-y-4">
          {/* KPIs */}
          {isProspect && (
            <div className="flex items-center gap-2 mb-1">
              <h3 className="text-sm font-semibold">Metricas de servicio</h3>
              <PreviewBadge />
            </div>
          )}
          {!isProspect && summary.totalRounds === 0 && (
            <div className="col-span-full flex flex-col items-center justify-center py-12 text-muted-foreground">
              <BarChart3 className="h-10 w-10 mb-3 opacity-40" />
              <p className="text-sm font-medium">Sin datos operacionales este mes</p>
              <p className="text-xs opacity-60 mt-1">Los datos aparecerán cuando se registren rondas</p>
            </div>
          )}
          {(isProspect || summary.totalRounds > 0) && (
            <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <KpiCard label="Cumplimiento mensual" value={`${summary.compliance}%`} trend={<TrendBadge value={summary.complianceTrend} suffix="%" />} color="emerald" />
            <KpiCard label="Rondas completadas" value={`${summary.completedRounds}/${summary.totalRounds}`} trend={<span className="text-[10px] text-zinc-500">este mes</span>} color="blue" />
            <KpiCard label="Trust Score promedio" value={String(summary.trustScore)} trend={<TrendBadge value={summary.trustTrend} />} color="blue" />
            <KpiCard label="Alertas del mes" value={String(summary.alerts)} trend={<TrendBadge value={-summary.alertsTrend} />} color={summary.alerts > 5 ? 'red' : 'emerald'} />
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
              <h3 className="text-sm font-semibold mb-3">Mejores guardias del mes</h3>
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
                      <span className={cn('text-sm font-bold tabular-nums',
                        g.trustAvg >= 85 ? 'text-emerald-400' : g.trustAvg >= 70 ? 'text-blue-400' : 'text-amber-400'
                      )}>
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

          {/* Footer */}
          <footer className="text-center text-[10px] text-zinc-600 pt-4 pb-8">
            Powered by Gard Security · Ultima actualizacion: {new Date().toLocaleString('es-CL')}
          </footer>
        </div>
      )}
    </div>
  )
}
