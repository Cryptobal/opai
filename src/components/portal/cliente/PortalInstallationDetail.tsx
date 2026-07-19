'use client'

import { useEffect, useState } from 'react'
import {
  ArrowLeft, Building2, MapPin, Clock, Shield, Route, ClipboardList,
  Package, DoorOpen, Loader2,
} from 'lucide-react'
import { ClienteSession } from '@/lib/portal-cliente-types'
import { PreviewBadge } from './PreviewBadge'
import { DEMO_INSTALACIONES, DEMO_SUMMARY } from '@/lib/portal/demo-data'
import { PortalDocsFisicosChecklist } from './PortalDocsFisicosChecklist'
import { PortalGuardiasInstalacion } from './PortalGuardiasInstalacion'

interface InstallationInfo {
  id: string
  name: string
  address: string | null
  commune: string | null
}

interface Props {
  session: ClienteSession
  installationId: string
  isProspect?: boolean
  onBack: () => void
  onNavigate: (section: string) => void
}

const QUICK_ACTIONS = [
  { id: 'rondas', icon: Route, label: 'Rondas', desc: 'GPS y checkpoints' },
  { id: 'marcaciones', icon: Clock, label: 'Marcaciones', desc: 'Asistencia guardias' },
  { id: 'posta', icon: ClipboardList, label: 'Posta', desc: 'Libro de novedades' },
  { id: 'equipamiento', icon: Package, label: 'Equipamiento', desc: 'Activos asignados' },
  { id: 'control-acceso', icon: DoorOpen, label: 'Control de Acceso', desc: 'Ingresos y salidas' },
] as const

export function PortalInstallationDetail({
  session,
  installationId,
  isProspect,
  onBack,
  onNavigate,
}: Props) {
  const [installation, setInstallation] = useState<InstallationInfo | null>(null)
  const [loading, setLoading] = useState(true)

  const isDemo = installationId.startsWith('demo-')

  useEffect(() => {
    if (isDemo) {
      const idx = parseInt(installationId.replace('demo-', ''), 10)
      const demo = DEMO_INSTALACIONES[idx] ?? DEMO_INSTALACIONES[0]
      setInstallation({
        id: installationId,
        name: demo.name,
        address: demo.address,
        commune: null,
      })
      setLoading(false)
      return
    }

    // Try to find in session first
    const fromSession = session.installations.find((i) => i.id === installationId)
    if (fromSession) {
      setInstallation({ id: fromSession.id, name: fromSession.name, address: null, commune: null })
    }

    // Fetch full details from empresa API
    fetch('/api/portal/cliente/empresa')
      .then((r) => r.json())
      .then((json) => {
        if (json.success && json.data?.installations) {
          const found = json.data.installations.find(
            (i: InstallationInfo) => i.id === installationId
          )
          if (found) {
            setInstallation(found)
          }
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [installationId, isDemo, session.installations])

  if (loading && !installation) {
    return (
      <div className="flex items-center justify-center h-40 gap-2 text-muted-foreground">
        <Loader2 className="w-5 h-5 animate-spin" />
        <span className="text-sm">Cargando instalación...</span>
      </div>
    )
  }

  if (!installation) {
    return (
      <div className="p-4 space-y-4">
        <button onClick={onBack} className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground text-sm transition-colors">
          <ArrowLeft className="w-4 h-4" /> Volver
        </button>
        <p className="text-muted-foreground text-sm">Instalación no encontrada.</p>
      </div>
    )
  }

  const demoSummary = isDemo ? DEMO_SUMMARY : null

  return (
    <div className="p-4 pb-20 space-y-5">
      {/* Back button */}
      <button
        onClick={onBack}
        className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground text-sm transition-colors"
      >
        <ArrowLeft className="w-4 h-4" /> Instalaciones
      </button>

      {/* Header */}
      <div className="bg-card opai-glass-soft-m border border-border rounded-xl p-4 space-y-3">
        <div className="flex items-start gap-3">
          <div className="bg-status-info-soft rounded-lg p-3 flex-shrink-0">
            <Building2 className="h-6 w-6 text-status-info-fg" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-semibold text-foreground truncate">{installation.name}</h2>
              {isProspect && <PreviewBadge />}
            </div>
            {(installation.address || installation.commune) && (
              <div className="flex items-center gap-1.5 mt-1 text-muted-foreground text-sm">
                <MapPin className="w-3.5 h-3.5 flex-shrink-0" />
                <span className="truncate">
                  {[installation.address, installation.commune].filter(Boolean).join(', ')}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* KPIs for demo/preview */}
        {demoSummary && (
          <div className="grid grid-cols-3 gap-2 pt-2 border-t border-border">
            <div className="text-center">
              <p className="text-lg font-bold text-status-info-fg">{demoSummary.compliance}%</p>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Cumplimiento</p>
            </div>
            <div className="text-center">
              <p className="text-lg font-bold text-status-info-fg">{demoSummary.completedRounds}/{demoSummary.totalRounds}</p>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Rondas hoy</p>
            </div>
            <div className="text-center">
              <p className="text-lg font-bold text-tint-violet-fg">{demoSummary.trustScore}</p>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Trust Score</p>
            </div>
          </div>
        )}
      </div>

      {/* Quick actions */}
      <div>
        <h3 className="text-sm font-medium text-muted-foreground mb-3">Acciones rápidas</h3>
        <div className="grid grid-cols-1 gap-2">
          {QUICK_ACTIONS.map((action) => (
            <button
              key={action.id}
              onClick={() => onNavigate(action.id)}
              className="flex items-center gap-3 p-3 bg-card opai-glass-soft-m hover:bg-muted border border-border rounded-xl transition-colors text-left"
            >
              <div className="bg-muted rounded-lg p-2 flex-shrink-0">
                <action.icon className="h-4 w-4 text-muted-foreground" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground">{action.label}</p>
                <p className="text-xs text-muted-foreground">{action.desc}</p>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Checklist de documentación física */}
      {!isDemo && (
        <div>
          <h3 className="text-sm font-medium text-muted-foreground mb-3">
            Documentación en terreno
          </h3>
          <PortalDocsFisicosChecklist installationId={installationId} />
        </div>
      )}

      {/* Equipo de seguridad asignado */}
      {isDemo ? (
        <div className="bg-card opai-glass-soft-m border border-border rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <Shield className="w-4 h-4 text-status-info-fg" />
            <h3 className="text-sm font-medium text-foreground">Equipo de seguridad</h3>
          </div>
          <p className="text-xs text-muted-foreground">
            Esta instalación cuenta con 4 guardias asignados en turnos rotativos.
          </p>
        </div>
      ) : (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Shield className="w-4 h-4 text-status-info-fg" />
            <h3 className="text-sm font-medium text-muted-foreground">
              Equipo de seguridad asignado
            </h3>
          </div>
          <PortalGuardiasInstalacion installationId={installationId} />
        </div>
      )}
    </div>
  )
}
