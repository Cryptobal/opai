'use client'

import { useState, useEffect, useCallback } from 'react'
import { ClienteSession } from '@/lib/portal-cliente-types'
import { Building2, ChevronRight, MapPin, Loader2 } from 'lucide-react'
import { PreviewBadge } from './PreviewBadge'
import { DEMO_INSTALACIONES } from '@/lib/portal/demo-data'

interface InstallationFull {
  id: string
  name: string
  address: string | null
  city: string | null
  commune: string | null
  lat: number | null
  lng: number | null
}

interface Props {
  session: ClienteSession
  onSelectInstallation?: (id: string) => void
  isProspect?: boolean
}

const GOOGLE_MAPS_API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || ''

export function PortalInstallations({ session, onSelectInstallation, isProspect }: Props) {
  const [installations, setInstallations] = useState<InstallationFull[]>([])
  const [loading, setLoading] = useState(!isProspect)

  const fetchInstallations = useCallback(async () => {
    try {
      const res = await fetch('/api/portal/cliente/empresa/instalaciones')
      const json = await res.json()
      if (json.success) {
        setInstallations(json.data)
      }
    } catch {
      // fallback to session data
      setInstallations(
        session.installations.map((i) => ({
          ...i,
          address: null,
          city: null,
          commune: null,
          lat: null,
          lng: null,
        }))
      )
    } finally {
      setLoading(false)
    }
  }, [session.installations])

  useEffect(() => {
    if (isProspect) {
      setInstallations(
        DEMO_INSTALACIONES.map((d, i) => ({
          id: `demo-${i}`,
          name: d.name,
          address: null,
          city: null,
          commune: null,
          lat: null,
          lng: null,
        }))
      )
      return
    }
    fetchInstallations()
  }, [isProspect, fetchInstallations])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-6 w-6 animate-spin text-zinc-400" />
      </div>
    )
  }

  return (
    <div className="p-4 pb-20 space-y-4">
      <div className="flex items-center gap-2">
        <h2 className="text-white font-semibold text-lg">Instalaciones</h2>
        {isProspect && <PreviewBadge />}
      </div>
      <p className="text-zinc-500 text-sm">
        {installations.length} instalacion{installations.length !== 1 ? 'es' : ''} activa{installations.length !== 1 ? 's' : ''}
      </p>
      <div className="space-y-3">
        {installations.map(inst => (
          <div
            key={inst.id}
            className="w-full bg-zinc-800/50 border border-zinc-700/50 rounded-xl overflow-hidden"
          >
            <button
              onClick={() => onSelectInstallation?.(inst.id)}
              className="w-full flex items-center gap-3 p-4 hover:bg-zinc-800 transition-colors text-left"
            >
              <div className="bg-blue-500/10 rounded-lg p-2.5 flex-shrink-0">
                <Building2 className="h-5 w-5 text-blue-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-white font-medium text-sm truncate">{inst.name}</p>
                {inst.address && (
                  <div className="flex items-center gap-1 mt-0.5">
                    <MapPin className="h-3 w-3 text-zinc-500 shrink-0" />
                    <p className="text-zinc-400 text-xs truncate">{inst.address}</p>
                  </div>
                )}
                {(inst.commune || inst.city) && (
                  <p className="text-zinc-500 text-xs mt-0.5">
                    {[inst.commune, inst.city].filter(Boolean).join(', ')}
                  </p>
                )}
              </div>
              <ChevronRight className="h-4 w-4 text-zinc-600 flex-shrink-0" />
            </button>

            {/* Mini mapa */}
            {inst.lat && inst.lng && GOOGLE_MAPS_API_KEY && (
              <a
                href={`https://www.google.com/maps/@${inst.lat},${inst.lng},17z`}
                target="_blank"
                rel="noopener noreferrer"
                className="block border-t border-zinc-700/50 hover:opacity-90 transition-opacity"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`https://maps.googleapis.com/maps/api/staticmap?center=${inst.lat},${inst.lng}&zoom=15&size=600x120&scale=2&markers=color:red%7C${inst.lat},${inst.lng}&key=${GOOGLE_MAPS_API_KEY}`}
                  alt={`Mapa de ${inst.name}`}
                  className="w-full h-[100px] object-cover"
                  loading="lazy"
                />
              </a>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
