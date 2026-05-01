'use client'

import { useState, useEffect } from 'react'
import { MessageSquare, Users, Mail, TrendingUp, ArrowRight } from 'lucide-react'

interface KPIs {
  totalSessions: number
  todaySessions: number
  weekSessions: number
  contactsCollected: number
  avgMessages: number
  conversionRate: number
}

interface Session {
  id: string
  sessionId: string
  visitorName: string | null
  visitorEmail: string | null
  referrer: string | null
  landingUrl: string | null
  messageCount: number
  contactCollectedAt: string | null
  createdAt: string
  lastEvent: string | null
}

interface DailyStat {
  date: string
  count: number
}

export default function MarketingChatPage() {
  const [kpis, setKpis] = useState<KPIs | null>(null)
  const [sessions, setSessions] = useState<Session[]>([])
  const [dailyStats, setDailyStats] = useState<DailyStat[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/platform/marketing-chat')
      .then((r) => r.json())
      .then((data) => {
        setKpis(data.kpis)
        setSessions(data.recentSessions || [])
        setDailyStats(data.dailyStats || [])
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="text-gray-400">Cargando analytics...</div>
      </div>
    )
  }

  const maxDaily = Math.max(...dailyStats.map((d) => d.count), 1)

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
          Marketing Chat Analytics
        </h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Tracking de visitantes que interactúan con el chatbot de opai.cl
        </p>
      </div>

      {/* KPI Cards */}
      {kpis && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          <KpiCard
            icon={<MessageSquare className="h-4 w-4" />}
            label="Sesiones hoy"
            value={kpis.todaySessions}
          />
          <KpiCard
            icon={<TrendingUp className="h-4 w-4" />}
            label="Últimos 7 días"
            value={kpis.weekSessions}
          />
          <KpiCard
            icon={<Users className="h-4 w-4" />}
            label="Total sesiones"
            value={kpis.totalSessions}
          />
          <KpiCard
            icon={<Mail className="h-4 w-4" />}
            label="Contactos capturados"
            value={kpis.contactsCollected}
            highlight
          />
          <KpiCard
            icon={<ArrowRight className="h-4 w-4" />}
            label="Msgs promedio"
            value={kpis.avgMessages}
          />
          <KpiCard
            icon={<TrendingUp className="h-4 w-4" />}
            label="Tasa conversión"
            value={`${kpis.conversionRate}%`}
            highlight
          />
        </div>
      )}

      {/* Daily chart */}
      {dailyStats.length > 0 && (
        <div className="rounded-xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-[#0f1a2e]">
          <h2 className="mb-4 text-sm font-semibold text-gray-700 dark:text-gray-300">
            Sesiones por día (últimos 30 días)
          </h2>
          <div className="flex items-end gap-1" style={{ height: '120px' }}>
            {dailyStats.slice().reverse().map((d) => (
              <div
                key={d.date}
                title={`${d.date}: ${d.count} sesiones`}
                className="flex-1 rounded-t bg-teal-500/80 transition-all hover:bg-teal-400"
                style={{
                  height: `${Math.max((d.count / maxDaily) * 100, 4)}%`,
                  minWidth: '4px',
                }}
              />
            ))}
          </div>
          <div className="mt-2 flex justify-between text-[10px] text-gray-400">
            <span>{dailyStats[dailyStats.length - 1]?.date}</span>
            <span>{dailyStats[0]?.date}</span>
          </div>
        </div>
      )}

      {/* Sessions table */}
      <div className="rounded-xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-[#0f1a2e]">
        <div className="border-b border-gray-200 px-6 py-4 dark:border-gray-800">
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
            Sesiones recientes ({sessions.length})
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-left text-xs uppercase tracking-wider text-gray-400 dark:border-gray-800">
                <th className="px-6 py-3">Fecha</th>
                <th className="px-6 py-3">Visitante</th>
                <th className="px-6 py-3">Mensajes</th>
                <th className="px-6 py-3">Página</th>
                <th className="px-6 py-3">Referrer</th>
                <th className="px-6 py-3">Estado</th>
              </tr>
            </thead>
            <tbody>
              {sessions.map((s) => (
                <tr
                  key={s.id}
                  className="border-b border-gray-50 transition-colors hover:bg-gray-50 dark:border-gray-800/50 dark:hover:bg-white/[0.02]"
                >
                  <td className="whitespace-nowrap px-6 py-3 text-gray-600 dark:text-gray-400">
                    {new Date(s.createdAt).toLocaleDateString('es-CL', {
                      day: '2-digit',
                      month: 'short',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </td>
                  <td className="px-6 py-3">
                    {s.visitorName ? (
                      <div>
                        <div className="font-medium text-gray-900 dark:text-white">
                          {s.visitorName}
                        </div>
                        <div className="text-xs text-teal-600 dark:text-status-info-fg">
                          {s.visitorEmail}
                        </div>
                      </div>
                    ) : (
                      <span className="text-gray-400">Anónimo</span>
                    )}
                  </td>
                  <td className="px-6 py-3">
                    <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600 dark:bg-gray-800 dark:text-gray-300">
                      {s.messageCount}
                    </span>
                  </td>
                  <td className="max-w-[150px] truncate px-6 py-3 text-gray-500 dark:text-gray-400">
                    {s.landingUrl || '—'}
                  </td>
                  <td className="max-w-[150px] truncate px-6 py-3 text-gray-500 dark:text-gray-400">
                    {s.referrer ? (() => { try { return new URL(s.referrer).hostname } catch { return s.referrer } })() : '—'}
                  </td>
                  <td className="px-6 py-3">
                    {s.contactCollectedAt ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-status-info-soft px-2 py-0.5 text-xs font-medium text-teal-600 dark:text-status-info-fg">
                        <Mail className="h-3 w-3" />
                        Contacto
                      </span>
                    ) : s.messageCount >= 4 ? (
                      <span className="inline-flex items-center rounded-full bg-status-warn-soft px-2 py-0.5 text-xs font-medium text-status-warn-fg dark:text-status-warn-fg">
                        Engaged
                      </span>
                    ) : (
                      <span className="text-xs text-gray-400">Visitante</span>
                    )}
                  </td>
                </tr>
              ))}
              {sessions.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-gray-400">
                    Aún no hay sesiones de chat registradas.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

function KpiCard({
  icon,
  label,
  value,
  highlight,
}: {
  icon: React.ReactNode
  label: string
  value: number | string
  highlight?: boolean
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-[#0f1a2e]">
      <div className="mb-2 flex items-center gap-2">
        <span className={highlight ? 'text-status-info-fg' : 'text-gray-400'}>{icon}</span>
        <span className="text-xs text-gray-500 dark:text-gray-400">{label}</span>
      </div>
      <div className={`text-2xl font-bold ${highlight ? 'text-status-info-fg' : 'text-gray-900 dark:text-white'}`}>
        {value}
      </div>
    </div>
  )
}
