'use client'

import { ClienteSession } from '@/lib/portal-cliente'
import { Building2, ChevronRight } from 'lucide-react'

interface Props {
  session: ClienteSession
  onSelectInstallation?: (id: string) => void
}

export function PortalInstallations({ session, onSelectInstallation }: Props) {
  return (
    <div className="p-4 pb-20 space-y-4">
      <h2 className="text-white font-semibold text-lg">Instalaciones</h2>
      <p className="text-zinc-500 text-sm">
        {session.installations.length} instalacion{session.installations.length !== 1 ? 'es' : ''} activa{session.installations.length !== 1 ? 's' : ''}
      </p>
      <div className="space-y-2">
        {session.installations.map(inst => (
          <button
            key={inst.id}
            onClick={() => onSelectInstallation?.(inst.id)}
            className="w-full flex items-center gap-3 p-4 bg-zinc-800/50 hover:bg-zinc-800 border border-zinc-700/50 rounded-xl transition-colors text-left"
          >
            <div className="bg-blue-500/10 rounded-lg p-2.5 flex-shrink-0">
              <Building2 className="h-5 w-5 text-blue-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-white font-medium text-sm truncate">{inst.name}</p>
              <p className="text-zinc-500 text-xs mt-0.5 truncate">ID: {inst.id}</p>
            </div>
            <ChevronRight className="h-4 w-4 text-zinc-600 flex-shrink-0" />
          </button>
        ))}
      </div>
    </div>
  )
}
