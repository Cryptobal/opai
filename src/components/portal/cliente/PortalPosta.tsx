'use client'
import { BookOpen, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { PreviewBadge } from './PreviewBadge'
import { usePortalData } from '@/hooks/usePortalData'
import { ExportButton } from './shared/ExportButton'

const STATUS_CONFIG = {
  normal: { label: 'Normal', color: 'text-emerald-400 bg-emerald-500/10' },
  novedad: { label: 'Con novedades', color: 'text-amber-400 bg-amber-500/10' },
  critico: { label: 'Critico', color: 'text-red-400 bg-red-500/10' },
  no_aplica: { label: 'N/A', color: 'text-zinc-500 bg-zinc-800' },
}

interface Props {
  selectedInstallation: string
}

export function PortalPosta({ selectedInstallation }: Props) {
  const { data, loading, isDemo } = usePortalData<any[]>({
    endpoint: '/api/portal/cliente/posta',
    demoKey: 'posta_list',
    params: selectedInstallation ? { installationId: selectedInstallation } : undefined,
  })
  const records = data ?? []

  if (loading) return (
    <div className="flex items-center justify-center h-48">
      <Loader2 className="h-5 w-5 animate-spin text-zinc-500" />
    </div>
  )

  return (
    <div className="px-4 py-4 pb-24 max-w-lg mx-auto">
      <div className="mb-4 flex items-start justify-between gap-2">
        <div>
          <h2 className="text-white font-semibold text-lg flex items-center gap-2">
            <BookOpen className="h-5 w-5 text-blue-400" /> Bitácora digital
            {isDemo && <PreviewBadge />}
          </h2>
          <p className="text-xs text-zinc-500 mt-1 ml-7">Registro digital de novedades — Adiós al cuaderno</p>
        </div>
        <ExportButton
          baseName="bitacora"
          sheetName="Bitácora"
          rows={records.map((r) => ({
            fecha: r.controlNocturno?.date
              ? new Date(r.controlNocturno.date).toLocaleDateString("es-CL")
              : "",
            estado: r.statusInstalacion ?? "normal",
            guardiasPresentes: r.guardiasPresentes ?? 0,
            guardiasRequeridos: r.guardiasRequeridos ?? 0,
            operadorCentral: r.controlNocturno?.centralOperatorName ?? "",
            notas: r.notes ?? "",
            notasGenerales: r.controlNocturno?.generalNotes ?? "",
          }))}
          columns={[
            { key: "fecha", label: "Fecha", width: 14 },
            { key: "estado", label: "Estado", width: 14 },
            { key: "guardiasPresentes", label: "Guardias presentes", width: 12 },
            { key: "guardiasRequeridos", label: "Guardias requeridos", width: 12 },
            { key: "operadorCentral", label: "Operador central", width: 20 },
            { key: "notas", label: "Notas", width: 40 },
            { key: "notasGenerales", label: "Notas generales", width: 40 },
          ]}
        />
      </div>
      {records.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <BookOpen className="h-8 w-8 text-zinc-700 mb-3" />
          <p className="text-sm font-medium text-zinc-400">Sin novedades registradas</p>
          <p className="text-xs text-zinc-600 mt-1">La bitácora digital reemplaza el cuaderno físico con trazabilidad completa.</p>
        </div>
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
