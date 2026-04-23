'use client'

import {
  LayoutDashboard, Building2, MapPin, BookOpen, MessageSquare, Ticket,
  FileText, Receipt, BarChart3, GitCompare, Bell, MoreHorizontal, ClipboardList,
  UserCheck, Building, Briefcase, ShieldCheck, TrendingUp, Package, FileCheck2, Eye,
} from 'lucide-react'
import { PortalConfig } from '@/lib/portal-cliente-types'
import { cn } from '@/lib/utils'
import { useEffect, useRef, useState } from 'react'

export type PortalSection =
  | 'dashboard' | 'instalaciones' | 'instalacion-detalle' | 'rondas' | 'posta' | 'chat'
  | 'tickets' | 'documentacion' | 'cotizaciones' | 'protocolos'
  | 'reportes' | 'comparativa' | 'alertas' | 'encuestas'
  | 'desempeno' | 'personal' | 'nosotros' | 'empresa'
  | 'control-acceso' | 'presentacion' | 'marcaciones' | 'equipamiento'
  | 'propuesta'

type NavGroup = 'operaciones' | 'mensajes' | 'analisis' | 'documentos' | 'proveedor'

const GROUP_LABELS: Record<NavGroup, string> = {
  operaciones: 'Operaciones',
  mensajes: 'Mensajes',
  analisis: 'Análisis',
  documentos: 'Documentos',
  proveedor: 'Mi Proveedor',
}

// Fixed bottom-nav tabs — priorizamos lo operativo (lo que el cliente
// realmente abre a diario): rondas, accesos y tickets. `instalaciones`
// pasa a vivir dentro del menú "Más" junto con el resto del detalle.
const MAIN_TABS: PortalSection[] = [
  'dashboard',
  'rondas',
  'control-acceso',
  'tickets',
  'chat',
]

// Grouped items shown inside the "Más" menu.
const GROUPED_ITEMS: Record<NavGroup, PortalSection[]> = {
  operaciones: ['instalaciones', 'marcaciones', 'posta', 'equipamiento', 'desempeno'],
  mensajes: ['alertas', 'encuestas'],
  analisis: ['reportes', 'comparativa'],
  documentos: ['documentacion', 'cotizaciones'],
  proveedor: ['empresa', 'nosotros', 'presentacion'],
}

type NavItem = {
  label: string
  icon: React.ComponentType<{ className?: string }>
  configKey?: keyof PortalConfig
  requiresPresentation?: boolean
}

const NAV_ITEMS: Record<PortalSection, NavItem> = {
  'dashboard': { label: 'Dashboard', icon: LayoutDashboard, configKey: 'dashboard' },
  'instalaciones': { label: 'Instalaciones', icon: Building2 },
  'instalacion-detalle': { label: 'Detalle', icon: Building2 },
  'rondas': { label: 'Rondas', icon: MapPin, configKey: 'rondas' },
  'marcaciones': { label: 'Marcaciones', icon: UserCheck, configKey: 'asistencia' },
  'posta': { label: 'Bitácora', icon: BookOpen, configKey: 'posta' },
  'equipamiento': { label: 'Equipamiento', icon: Package },
  'control-acceso': { label: 'Accesos', icon: ShieldCheck },
  'desempeno': { label: 'Desempeño', icon: TrendingUp, configKey: 'gamificacion' },
  'chat': { label: 'Chat', icon: MessageSquare, configKey: 'chat_instalacion' },
  'tickets': { label: 'Tickets', icon: Ticket, configKey: 'tickets' },
  'alertas': { label: 'Actividad', icon: Bell, configKey: 'alertas' },
  'encuestas': { label: 'Encuestas', icon: ClipboardList, configKey: 'encuestas' },
  'reportes': { label: 'Reportes', icon: BarChart3, configKey: 'reportes' },
  'comparativa': { label: 'Comparativa', icon: GitCompare, configKey: 'comparativa' },
  'documentacion': { label: 'Documentos', icon: FileText, configKey: 'documentacion' },
  'protocolos': { label: 'Protocolos', icon: FileCheck2 },
  'cotizaciones': { label: 'Cotizaciones', icon: Receipt, configKey: 'cotizaciones' },
  'empresa': { label: 'Mi empresa', icon: Briefcase },
  'nosotros': { label: 'Sobre nosotros', icon: Building },
  'presentacion': { label: 'Presentación', icon: Eye, requiresPresentation: true },
  'personal': { label: 'Personal', icon: UserCheck },
  'propuesta': { label: 'Propuesta', icon: FileCheck2 },
}

interface Props {
  portalConfig: PortalConfig
  activeSection: PortalSection
  onSection: (s: PortalSection) => void
  isProspect?: boolean
  hasActivePresentation?: boolean
}

export function PortalClienteNav({
  portalConfig,
  activeSection,
  onSection,
  isProspect,
  hasActivePresentation,
}: Props) {
  const [moreOpen, setMoreOpen] = useState(false)
  const moreRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!moreOpen) return
    function handleClick(e: MouseEvent) {
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) {
        setMoreOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [moreOpen])

  function isItemVisible(section: PortalSection): boolean {
    const item = NAV_ITEMS[section]
    if (!item) return false
    if (item.configKey && !portalConfig[item.configKey]) return false
    if (item.requiresPresentation && !hasActivePresentation) return false
    return true
  }

  const visibleMain = MAIN_TABS.filter(isItemVisible)

  function labelFor(s: PortalSection): string {
    if (s === 'cotizaciones') return isProspect ? 'Propuesta' : 'Cotizaciones'
    return NAV_ITEMS[s].label
  }

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-zinc-900/95 backdrop-blur border-t border-zinc-800 z-50 safe-area-pb">
      <div className="flex items-center justify-around h-16 px-1 max-w-lg mx-auto">
        {visibleMain.map(id => {
          const item = NAV_ITEMS[id]
          const Icon = item.icon
          const active = activeSection === id
          return (
            <button
              key={id}
              onClick={() => { onSection(id); setMoreOpen(false) }}
              className={cn(
                'flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-xl transition-all min-w-[56px]',
                active ? 'text-teal-400 bg-teal-500/10' : 'text-zinc-500 hover:text-zinc-300 active:bg-zinc-800',
              )}
            >
              <Icon className="h-5 w-5" />
              <span className="text-[10px] leading-tight font-medium">{labelFor(id)}</span>
            </button>
          )
        })}

        <div ref={moreRef} className="relative">
          <button
            onClick={() => setMoreOpen(!moreOpen)}
            className={cn(
              'flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-xl transition-all min-w-[56px]',
              moreOpen ? 'text-teal-400 bg-teal-500/10' : 'text-zinc-500 hover:text-zinc-300 active:bg-zinc-800',
            )}
          >
            <MoreHorizontal className="h-5 w-5" />
            <span className="text-[10px] leading-tight font-medium">Más</span>
          </button>
          {moreOpen && (
            <div className="absolute bottom-14 right-0 bg-zinc-800 border border-zinc-700 rounded-xl shadow-xl py-2 min-w-[200px] max-w-[calc(100vw-2rem)] max-h-[70vh] overflow-y-auto z-10">
              {(Object.keys(GROUPED_ITEMS) as NavGroup[]).map((group, gIdx) => {
                const items = GROUPED_ITEMS[group].filter(isItemVisible)
                if (items.length === 0) return null
                return (
                  <div key={group}>
                    {gIdx > 0 && <div className="border-t border-zinc-700 my-2" />}
                    <p className="px-4 py-1 text-[10px] text-zinc-500 uppercase tracking-wider font-medium">
                      {GROUP_LABELS[group]}
                    </p>
                    {items.map(id => {
                      const item = NAV_ITEMS[id]
                      const Icon = item.icon
                      const active = activeSection === id
                      return (
                        <button
                          key={id}
                          onClick={() => { onSection(id); setMoreOpen(false) }}
                          className={cn(
                            'flex items-center gap-3 w-full px-4 py-2.5 text-sm transition-colors',
                            active ? 'text-teal-400 bg-teal-500/10' : 'text-zinc-300 hover:bg-zinc-700',
                          )}
                        >
                          <Icon className="h-4 w-4 flex-shrink-0" />
                          {labelFor(id)}
                        </button>
                      )
                    })}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </nav>
  )
}
