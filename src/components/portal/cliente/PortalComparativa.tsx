'use client'

import { useEffect, useState } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
} from 'recharts'
import { Loader2, GitCompare, TrendingUp } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ClienteSession } from '@/lib/portal-cliente'
import { PreviewBadge } from './PreviewBadge'

/* ── Types ── */

type Metric = 'rondas_cumplimiento' | 'asistencia' | 'tickets'

interface ComparativaRow {
  installationId: string
  installationName: string
  value: number
}

/* ── Constants ── */

const COLORS = ['#3b82f6', '#8b5cf6', '#06b6d4', '#10b981', '#f59e0b']

const METRIC_LABELS: Record<Metric, string> = {
  rondas_cumplimiento: 'Rondas',
  asistencia: 'Asistencia',
  tickets: 'Tickets',
}

const METRIC_SUFFIX: Record<Metric, string> = {
  rondas_cumplimiento: '%',
  asistencia: '%',
  tickets: '',
}

/* ── Component ── */

interface Props {
  session: ClienteSession
  isProspect?: boolean
}

export function PortalComparativa({ session, isProspect }: Props) {
  if (isProspect) {
    return (
      <div className="flex-1 max-w-6xl mx-auto w-full px-4 py-4 pb-24 space-y-4">
        <div className="flex items-center gap-2">
          <GitCompare className="h-5 w-5 text-blue-400" />
          <h2 className="text-base font-semibold">Vista Comparativa</h2>
          <PreviewBadge />
        </div>
        <div className="bg-zinc-800/60 border border-zinc-700/50 rounded-xl p-5 space-y-3">
          <p className="text-sm text-zinc-300 font-medium">Benchmarks del servicio</p>
          <ul className="space-y-2 text-xs text-zinc-400">
            <li className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-blue-400" />Compara rendimiento entre instalaciones</li>
            <li className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-blue-400" />Metricas de rondas, asistencia y tickets</li>
            <li className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-blue-400" />Ranking automatico de instalaciones</li>
            <li className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-blue-400" />Graficos interactivos por periodo</li>
          </ul>
        </div>
      </div>
    )
  }

  const [metric, setMetric] = useState<Metric>('rondas_cumplimiento')
  const [data, setData] = useState<ComparativaRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (session.installations.length < 2) return
    loadData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [metric])

  async function loadData() {
    setLoading(true)
    setError(null)
    try {
      // Default: last 30 days
      const to = new Date()
      const from = new Date()
      from.setDate(from.getDate() - 30)

      const params = new URLSearchParams({
        metric,
        from: from.toISOString(),
        to: to.toISOString(),
      })

      const res = await fetch(`/api/portal/cliente/comparativa?${params}`)
      const json = await res.json()
      if (json.success) {
        setData(json.data)
      } else {
        setError(json.error ?? 'Error al cargar datos')
      }
    } catch {
      setError('Error de conexion')
    } finally {
      setLoading(false)
    }
  }

  // Guard: need 2+ installations
  if (session.installations.length < 2) {
    return (
      <div className="flex-1 max-w-6xl mx-auto w-full px-4 py-4 pb-24">
        <div className="flex flex-col items-center justify-center h-64 gap-3 text-zinc-500">
          <GitCompare className="h-10 w-10 text-zinc-600" />
          <p className="text-sm font-medium">Vista Comparativa</p>
          <p className="text-xs text-zinc-600 text-center max-w-xs">
            Necesitas 2 o mas instalaciones para comparar el rendimiento entre ellas.
          </p>
        </div>
      </div>
    )
  }

  const suffix = METRIC_SUFFIX[metric]
  const sorted = [...data].sort((a, b) => b.value - a.value)

  return (
    <div className="flex-1 max-w-6xl mx-auto w-full px-4 py-4 pb-24 space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2">
        <GitCompare className="h-5 w-5 text-blue-400" />
        <h2 className="text-base font-semibold">Vista Comparativa</h2>
        <span className="text-xs text-zinc-500 ml-auto">Ultimos 30 dias</span>
      </div>

      {/* Metric selector */}
      <div className="flex gap-2">
        {(Object.keys(METRIC_LABELS) as Metric[]).map((m) => (
          <button
            key={m}
            onClick={() => setMetric(m)}
            className={cn(
              'px-3 py-1.5 rounded-lg text-xs font-medium transition-colors',
              metric === m
                ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200 border border-zinc-700'
            )}
          >
            {METRIC_LABELS[m]}
          </button>
        ))}
      </div>

      {/* Chart */}
      <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-4">
        {loading ? (
          <div className="flex items-center justify-center h-48">
            <Loader2 className="h-6 w-6 animate-spin text-zinc-500" />
          </div>
        ) : error ? (
          <div className="flex items-center justify-center h-48">
            <p className="text-xs text-red-400">{error}</p>
          </div>
        ) : data.length === 0 ? (
          <div className="flex items-center justify-center h-48">
            <p className="text-xs text-zinc-500">Sin datos en el periodo seleccionado</p>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={data} margin={{ top: 4, right: 4, bottom: 4, left: -16 }}>
              <XAxis
                dataKey="installationName"
                tick={{ fontSize: 10, fill: '#94a3b8' }}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                tick={{ fontSize: 10, fill: '#94a3b8' }}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v) => `${v}${suffix}`}
              />
              <Tooltip
                contentStyle={{ background: '#18181b', border: 'none', borderRadius: 8, fontSize: 12 }}
                formatter={(value) => [`${value}${suffix}`, METRIC_LABELS[metric]]}
              />
              <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                {data.map((_, i) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Ranking table */}
      {!loading && !error && sorted.length > 0 && (
        <div className="bg-zinc-900 rounded-xl border border-zinc-800 overflow-hidden">
          <div className="px-4 py-3 border-b border-zinc-800 flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-zinc-400" />
            <span className="text-xs font-medium text-zinc-300">Ranking de instalaciones</span>
          </div>
          <div className="divide-y divide-zinc-800">
            {sorted.map((row, idx) => (
              <div key={row.installationId} className="flex items-center gap-3 px-4 py-3">
                {/* Rank badge */}
                <span
                  className={cn(
                    'w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0',
                    idx === 0
                      ? 'bg-yellow-500/20 text-yellow-400'
                      : idx === 1
                      ? 'bg-zinc-400/20 text-zinc-300'
                      : idx === 2
                      ? 'bg-orange-500/20 text-orange-400'
                      : 'bg-zinc-800 text-zinc-500'
                  )}
                >
                  {idx + 1}
                </span>

                {/* Color dot */}
                <span
                  className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                  style={{ background: COLORS[data.findIndex((d) => d.installationId === row.installationId) % COLORS.length] }}
                />

                {/* Name */}
                <span className="text-sm text-zinc-200 flex-1 truncate">{row.installationName}</span>

                {/* Value */}
                <span className="text-sm font-semibold text-zinc-100">
                  {row.value}{suffix}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
