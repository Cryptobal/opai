'use client'

import { ClienteSession } from '@/lib/portal-cliente-types'
import { Building2, ChevronRight } from 'lucide-react'
import { PreviewBadge } from './PreviewBadge'
import { DEMO_INSTALACIONES } from '@/lib/portal/demo-data'

interface Props {
  session: ClienteSession
  onSelectInstallation?: (id: string) => void
  isProspect?: boolean
}

export function PortalInstallations({ session, onSelectInstallation, isProspect }: Props) {
  const installations = isProspect
    ? DEMO_INSTALACIONES.map((d, i) => ({ id: `demo-${i}`, name: d.name }))
    : session.installations

  return (
    <div className="p-4 pb-20 space-y-4">
      <div className="flex items-center gap-2">
        <h2 className="text-foreground font-semibold text-lg">Instalaciones</h2>
        {isProspect && <PreviewBadge />}
      </div>
      <p className="text-muted-foreground text-sm">
        {installations.length} instalacion{installations.length !== 1 ? 'es' : ''} activa{installations.length !== 1 ? 's' : ''}
      </p>
      <div className="space-y-2">
        {installations.map(inst => (
          <button
            key={inst.id}
            onClick={() => onSelectInstallation?.(inst.id)}
            className="w-full flex items-center gap-3 p-4 bg-card opai-glass-soft-m hover:bg-muted border border-border rounded-xl transition-colors text-left"
          >
            <div className="bg-status-info-soft rounded-lg p-2.5 flex-shrink-0">
              <Building2 className="h-5 w-5 text-status-info-fg" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-foreground font-medium text-sm break-words">{inst.name}</p>
              <p className="text-muted-foreground text-xs mt-0.5 break-all">ID: {inst.id}</p>
            </div>
            <ChevronRight className="h-4 w-4 text-zinc-600 flex-shrink-0" />
          </button>
        ))}
      </div>
    </div>
  )
}
