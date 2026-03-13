'use client'

import { useEffect, useState } from 'react'
import { Loader2, ClipboardList, ChevronDown, ChevronUp, Star } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ClienteSession } from '@/lib/portal-cliente-types'

/* ── Types ── */

interface Encuesta {
  id: string
  installationId: string
  contactName: string
  serviceQuality: number | null
  scheduleCompliance: number | null
  personalPresentation: number | null
  professionalism: number | null
  supervisionPresence: number | null
  incidentResponse: number | null
  npsScore: number | null
  additionalComments: string | null
  averageScore: number | null
  createdAt: string
}

/* ── Helpers ── */

function StarRating({ value, max = 5 }: { value: number | null; max?: number }) {
  if (value === null) return <span className="text-xs text-zinc-500">N/A</span>
  const filled = Math.round(value)
  return (
    <span className="flex items-center gap-0.5">
      {Array.from({ length: max }).map((_, i) => (
        <Star
          key={i}
          className={cn(
            'h-3.5 w-3.5',
            i < filled ? 'fill-yellow-400 text-yellow-400' : 'text-zinc-700'
          )}
        />
      ))}
      <span className="text-xs text-zinc-400 ml-1">{value.toFixed(1)}</span>
    </span>
  )
}

function NpsBadge({ score }: { score: number | null }) {
  if (score === null) return null
  if (score >= 9) {
    return (
      <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-500/15 text-emerald-400 border border-emerald-500/20">
        Promotor
      </span>
    )
  }
  if (score >= 7) {
    return (
      <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-yellow-500/15 text-yellow-400 border border-yellow-500/20">
        Neutral
      </span>
    )
  }
  return (
    <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-red-500/15 text-red-400 border border-red-500/20">
      Detractor
    </span>
  )
}

const SCORE_LABELS: Array<{ key: keyof Encuesta; label: string }> = [
  { key: 'serviceQuality', label: 'Calidad del servicio' },
  { key: 'scheduleCompliance', label: 'Cumplimiento de horario' },
  { key: 'personalPresentation', label: 'Presentación personal' },
  { key: 'professionalism', label: 'Profesionalismo' },
  { key: 'supervisionPresence', label: 'Presencia de supervisión' },
  { key: 'incidentResponse', label: 'Respuesta a incidentes' },
]

function formatDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric' })
}

/* ── EncuestaCard ── */

function EncuestaCard({
  encuesta,
  installationName,
}: {
  encuesta: Encuesta
  installationName: string
}) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="bg-zinc-900 rounded-xl border border-zinc-800 overflow-hidden">
      {/* Header row */}
      <button
        className="w-full flex items-start gap-3 p-4 text-left hover:bg-zinc-800/50 transition-colors"
        onClick={() => setExpanded((v) => !v)}
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-zinc-400">{formatDate(encuesta.createdAt)}</span>
            <span className="text-xs text-zinc-600">·</span>
            <span className="text-xs font-medium text-zinc-300 truncate">{installationName}</span>
          </div>
          <div className="mt-1.5 flex items-center gap-3 flex-wrap">
            <StarRating value={encuesta.averageScore} />
            <NpsBadge score={encuesta.npsScore} />
          </div>
          {encuesta.contactName && (
            <p className="text-[10px] text-zinc-500 mt-1">Por: {encuesta.contactName}</p>
          )}
        </div>
        {expanded ? (
          <ChevronUp className="h-4 w-4 text-zinc-500 flex-shrink-0 mt-0.5" />
        ) : (
          <ChevronDown className="h-4 w-4 text-zinc-500 flex-shrink-0 mt-0.5" />
        )}
      </button>

      {/* Expanded detail */}
      {expanded && (
        <div className="px-4 pb-4 space-y-3 border-t border-zinc-800 pt-3">
          {/* Individual scores */}
          <div className="grid grid-cols-1 gap-2">
            {SCORE_LABELS.map(({ key, label }) => {
              const val = encuesta[key] as number | null
              if (val === null) return null
              return (
                <div key={key} className="flex items-center justify-between gap-2">
                  <span className="text-xs text-zinc-400 flex-1">{label}</span>
                  <StarRating value={val} />
                </div>
              )
            })}
          </div>

          {/* NPS */}
          {encuesta.npsScore !== null && (
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs text-zinc-400">NPS Score</span>
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-zinc-200">{encuesta.npsScore}/10</span>
                <NpsBadge score={encuesta.npsScore} />
              </div>
            </div>
          )}

          {/* Comments */}
          {encuesta.additionalComments && (
            <div className="bg-zinc-800/50 rounded-lg p-3">
              <p className="text-[10px] text-zinc-500 uppercase tracking-wide mb-1">Comentarios</p>
              <p className="text-xs text-zinc-300 leading-relaxed">{encuesta.additionalComments}</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/* ── Main component ── */

const DEMO_ENCUESTAS: Encuesta[] = [
  {
    id: 'demo-1',
    installationId: 'demo',
    contactName: 'Evaluación mensual',
    serviceQuality: 4.5,
    scheduleCompliance: 5,
    personalPresentation: 4,
    professionalism: 4.5,
    supervisionPresence: 4,
    incidentResponse: 5,
    npsScore: 9,
    additionalComments: 'Excelente servicio. Los guardias son puntuales y profesionales.',
    averageScore: 4.5,
    createdAt: new Date(Date.now() - 15 * 86400000).toISOString(),
  },
  {
    id: 'demo-2',
    installationId: 'demo',
    contactName: 'Evaluación trimestral',
    serviceQuality: 4,
    scheduleCompliance: 4.5,
    personalPresentation: 4.5,
    professionalism: 4,
    supervisionPresence: 3.5,
    incidentResponse: 4,
    npsScore: 8,
    additionalComments: null,
    averageScore: 4.1,
    createdAt: new Date(Date.now() - 45 * 86400000).toISOString(),
  },
]

interface Props {
  session: ClienteSession
  isProspect?: boolean
}

export function PortalEncuestas({ session, isProspect }: Props) {
  const [encuestas, setEncuestas] = useState<Encuesta[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (isProspect) {
      setEncuestas(DEMO_ENCUESTAS)
      setLoading(false)
      return
    }
    loadEncuestas()
  }, [isProspect])

  async function loadEncuestas() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/portal/cliente/encuestas')
      const json = await res.json()
      if (json.success) {
        setEncuestas(json.data)
      } else {
        setError(json.error ?? 'Error al cargar encuestas')
      }
    } catch {
      setError('Error de conexión')
    } finally {
      setLoading(false)
    }
  }

  // Build a name lookup from session installations
  const installationMap = Object.fromEntries(
    session.installations.map((i) => [i.id, i.name])
  )

  return (
    <div className="flex-1 max-w-6xl mx-auto w-full px-4 py-4 pb-24 space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2">
        <ClipboardList className="h-5 w-5 text-blue-400" />
        <h2 className="text-base font-semibold">Encuestas de satisfacción</h2>
      </div>
      <p className="text-xs text-zinc-500 -mt-2">
        Tu opinión mejora nuestro servicio — Feedback directo
      </p>

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center h-48">
          <Loader2 className="h-6 w-6 animate-spin text-zinc-500" />
        </div>
      ) : error ? (
        <div className="flex items-center justify-center h-48">
          <p className="text-xs text-red-400">{error}</p>
        </div>
      ) : encuestas.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-48 gap-3 text-zinc-500">
          <ClipboardList className="h-10 w-10 text-zinc-700" />
          <p className="text-sm">No hay encuestas pendientes</p>
          <p className="text-xs text-zinc-600 text-center max-w-xs">
            Cuando haya una encuesta disponible, aparecerá aquí.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {encuestas.map((enc) => (
            <EncuestaCard
              key={enc.id}
              encuesta={enc}
              installationName={installationMap[enc.installationId] ?? enc.installationId}
            />
          ))}
        </div>
      )}
    </div>
  )
}
