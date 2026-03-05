'use client'
import { useState, useEffect } from 'react'
import { BookOpen, Loader2 } from 'lucide-react'
import { ClienteSession } from '@/lib/portal-cliente'
import { cn } from '@/lib/utils'
import { PreviewBadge } from './PreviewBadge'
import { DEMO_POSTA } from '@/lib/portal/demo-data'

const STATUS_CONFIG = {
  normal: { label: 'Normal', color: 'text-emerald-400 bg-emerald-500/10' },
  novedad: { label: 'Con novedades', color: 'text-amber-400 bg-amber-500/10' },
  critico: { label: 'Critico', color: 'text-red-400 bg-red-500/10' },
  no_aplica: { label: 'N/A', color: 'text-zinc-500 bg-zinc-800' },
}

interface Props {
  session: ClienteSession
  selectedInstallation: string
  isProspect?: boolean
}

export function PortalPosta({ session, selectedInstallation, isProspect }: Props) {
  const [records, setRecords] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (isProspect) {
      setRecords(
        DEMO_POSTA.map((p, i) => ({
          id: `demo-${i}`,
          statusInstalacion: 'normal',
          guardiasPresentes: 2,
          guardiasRequeridos: 2,
          notes: p.novedades,
          controlNocturno: {
            date: new Date().toISOString(),
            centralOperatorName: 'Central OPAI',
            generalNotes: null,
          },
        }))
      )
      setLoading(false)
      return
    }
    setLoading(true)
    fetch(`/api/portal/cliente/posta?installationId=${selectedInstallation}`, {
      headers: {
        'x-contact-id': session.contactId,
        'x-tenant-id': session.tenantId,
        'x-account-id': session.accountId,
      },
    })
      .then(r => r.json())
      .then(j => { if (j.success) setRecords(j.data) })
      .finally(() => setLoading(false))
  }, [isProspect, selectedInstallation, session])

  if (loading) return (
    <div className="flex items-center justify-center h-48">
      <Loader2 className="h-5 w-5 animate-spin text-zinc-500" />
    </div>
  )

  return (
    <div className="px-4 py-4 pb-24 max-w-lg mx-auto">
      <h2 className="text-white font-semibold text-lg mb-4 flex items-center gap-2">
        <BookOpen className="h-5 w-5 text-blue-400" /> Posta / Bitacora
        {isProspect && <PreviewBadge />}
      </h2>
      {records.length === 0 ? (
        <p className="text-zinc-500 text-sm text-center py-12">Sin registros de posta recientes</p>
      ) : (
        <div className="space-y-3">
          {records.map(r => {
            const statusKey = (r.statusInstalacion as string) ?? 'normal'
            const cfg = STATUS_CONFIG[statusKey as keyof typeof STATUS_CONFIG] ?? STATUS_CONFIG.normal
            const dateLabel = r.controlNocturno?.date
              ? new Date(r.controlNocturno.date).toLocaleDateString('es-CL', {
                  weekday: 'short',
                  day: 'numeric',
                  month: 'short',
                })
              : '-'
            return (
              <div key={r.id} className="bg-zinc-800/60 border border-zinc-700/50 rounded-xl p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-white text-sm font-medium">{dateLabel}</span>
                  <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium', cfg.color)}>
                    {cfg.label}
                  </span>
                </div>
                <div className="flex gap-4 text-xs text-zinc-400">
                  <span>
                    Guardias:{' '}
                    <span className="text-white font-medium">
                      {r.guardiasPresentes ?? 0}/{r.guardiasRequeridos ?? 0}
                    </span>
                  </span>
                  {r.controlNocturno?.centralOperatorName && (
                    <span>Central: {r.controlNocturno.centralOperatorName}</span>
                  )}
                </div>
                {r.notes && <p className="text-zinc-400 text-xs">{r.notes}</p>}
                {r.controlNocturno?.generalNotes && (
                  <p className="text-zinc-500 text-xs border-t border-zinc-700 pt-2 mt-2">
                    {r.controlNocturno.generalNotes}
                  </p>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
