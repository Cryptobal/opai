'use client'

import {
  LayoutDashboard, Building2, MapPin, BookOpen, MessageSquare, Ticket,
  FileText, Receipt, BarChart3, GitCompare, Bell, MoreHorizontal, ClipboardList,
  UserCheck, FileCheck2, Building, Briefcase, ShieldCheck, TrendingUp
} from 'lucide-react'
import { PortalConfig } from '@/lib/portal-cliente-types'
import { cn } from '@/lib/utils'
import { useEffect, useRef, useState } from 'react'

export type PortalSection =
  | 'dashboard' | 'instalaciones' | 'rondas' | 'posta' | 'chat'
  | 'tickets' | 'documentacion' | 'cotizaciones'
  | 'reportes' | 'comparativa' | 'alertas' | 'encuestas'
  | 'desempeno' | 'personal' | 'propuesta' | 'nosotros' | 'empresa'
  | 'control-acceso' | 'presentacion' | 'marcaciones'

type NavGroup = 'operaciones' | 'comunicacion' | 'documentacion' | 'administracion'

const GROUP_LABELS: Record<NavGroup, string> = {
  operaciones: 'Operaciones',
  comunicacion: 'Comunicación',
  documentacion: 'Documentación',
  administracion: 'Administración',
}

const ALL_NAV_ITEMS: Array<{
  id: PortalSection
  label: string
  icon: React.ComponentType<{ className?: string }>
  configKey?: keyof PortalConfig
  prospectOnly?: boolean
  group?: NavGroup
}> = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, configKey: 'dashboard' },
  { id: 'instalaciones', label: 'Instalaciones', icon: Building2, configKey: 'guardias' },
  { id: 'rondas', label: 'Rondas', icon: MapPin, configKey: 'rondas' },
  { id: 'marcaciones', label: 'Marcaciones', icon: UserCheck, configKey: 'guardias' },
  { id: 'posta', label: 'Bitácora', icon: BookOpen, configKey: 'posta' },
  { id: 'chat', label: 'Chat', icon: MessageSquare, configKey: 'chat_instalacion', group: 'comunicacion' },
  { id: 'tickets', label: 'Tickets', icon: Ticket, configKey: 'tickets', group: 'comunicacion' },
  { id: 'alertas', label: 'Alertas', icon: Bell, configKey: 'alertas', group: 'comunicacion' },
  { id: 'reportes', label: 'Reportes', icon: BarChart3, configKey: 'reportes', group: 'operaciones' },
  { id: 'comparativa', label: 'Comparativa', icon: GitCompare, configKey: 'comparativa', group: 'operaciones' },
  { id: 'desempeno', label: 'Desempeño', icon: TrendingUp, configKey: 'gamificacion', group: 'operaciones' },
  { id: 'encuestas', label: 'Encuestas', icon: ClipboardList, configKey: 'encuestas', group: 'operaciones' },
  { id: 'documentacion', label: 'Documentos', icon: FileText, configKey: 'documentacion', group: 'documentacion' },
  { id: 'cotizaciones', label: 'Cotizaciones', icon: Receipt, configKey: 'cotizaciones', group: 'documentacion' },
  { id: 'personal', label: 'Personal', icon: UserCheck, group: 'administracion' },
  { id: 'empresa', label: 'Empresa', icon: Briefcase, group: 'administracion' },
  { id: 'control-acceso', label: 'Accesos', icon: ShieldCheck, group: 'administracion' },
  { id: 'propuesta', label: 'Propuesta', icon: FileCheck2, prospectOnly: true },
  { id: 'nosotros', label: 'Gard', icon: Building, prospectOnly: true },
]

interface Props {
  portalConfig: PortalConfig
  activeSection: PortalSection
  onSection: (s: PortalSection) => void
  isProspect?: boolean
}

// Fixed 4 bottom-nav tabs for prospect mode; remaining modules go to "Más"
const PROSPECT_MAIN_IDS: PortalSection[] = ['dashboard', 'propuesta', 'nosotros', 'chat']

const GROUP_ORDER: NavGroup[] = ['operaciones', 'comunicacion', 'documentacion', 'administracion']

export function PortalClienteNav({ portalConfig, activeSection, onSection, isProspect }: Props) {
  const [moreOpen, setMoreOpen] = useState(false)
  const moreRef = useRef<HTMLDivElement>(null)

  // Cerrar al hacer clic fuera del menú "Más"
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

  const visibleItems = ALL_NAV_ITEMS.filter(item => {
    // Hide prospect-only items when not in prospect mode
    if (item.prospectOnly && !isProspect) return false
    // Hide config-gated items that are disabled
    if (item.configKey && !portalConfig[item.configKey]) return false
    return true
  })

  // Prospect mode: fixed 4 tabs + "Más" with all other modules (demo)
  const mainItems = isProspect
    ? ALL_NAV_ITEMS.filter(item => PROSPECT_MAIN_IDS.includes(item.id))
    : visibleItems.slice(0, 4)
  const extraItems = isProspect
    ? ALL_NAV_ITEMS.filter(item => !PROSPECT_MAIN_IDS.includes(item.id) && !item.prospectOnly)
    : visibleItems.slice(4)
  const hasExtra = extraItems.length > 0

  // Group extra items
  const groupedExtras = hasExtra ? (() => {
    const groups: Array<{ group: NavGroup; items: typeof extraItems }> = []
    const ungrouped: typeof extraItems = []

    for (const g of GROUP_ORDER) {
      const items = extraItems.filter(i => i.group === g)
      if (items.length > 0) groups.push({ group: g, items })
    }
    for (const item of extraItems) {
      if (!item.group) ungrouped.push(item)
    }

    return { groups, ungrouped }
  })() : null

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-zinc-900/95 backdrop-blur border-t border-zinc-800 z-50 safe-area-pb">
      <div className="flex items-center justify-around h-16 px-1 max-w-lg mx-auto">
        {mainItems.map(item => {
          const Icon = item.icon
          const active = activeSection === item.id
          return (
            <button
              key={item.id}
              onClick={() => { onSection(item.id); setMoreOpen(false) }}
              className={cn(
                'flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-xl transition-all min-w-[56px]',
                active
                  ? 'text-teal-400 bg-teal-500/10'
                  : 'text-zinc-500 hover:text-zinc-300 active:bg-zinc-800'
              )}
            >
              <Icon className="h-5 w-5" />
              <span className="text-[10px] leading-tight font-medium">{item.label}</span>
            </button>
          )
        })}

        {hasExtra && (
          <div ref={moreRef} className="relative">
            <button
              onClick={() => setMoreOpen(!moreOpen)}
              className={cn(
                'flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-xl transition-all min-w-[56px]',
                moreOpen || extraItems.some(i => i.id === activeSection)
                  ? 'text-teal-400 bg-teal-500/10'
                  : 'text-zinc-500 hover:text-zinc-300 active:bg-zinc-800'
              )}
            >
              <MoreHorizontal className="h-5 w-5" />
              <span className="text-[10px] leading-tight font-medium">Más</span>
            </button>
            {moreOpen && groupedExtras && (
              <div className="absolute bottom-14 right-0 bg-zinc-800 border border-zinc-700 rounded-xl shadow-xl py-2 min-w-[180px] max-w-[calc(100vw-2rem)] max-h-[70vh] overflow-y-auto z-10">
                {groupedExtras.groups.map((group, gIdx) => (
                  <div key={group.group}>
                    {gIdx > 0 && <div className="border-t border-border my-2" />}
                    <p className="px-4 py-1 text-[10px] text-muted-foreground uppercase tracking-wider font-medium">
                      {GROUP_LABELS[group.group]}
                    </p>
                    {group.items.map(item => {
                      const Icon = item.icon
                      const active = activeSection === item.id
                      return (
                        <button
                          key={item.id}
                          onClick={() => { onSection(item.id); setMoreOpen(false) }}
                          className={cn(
                            'flex items-center gap-3 w-full px-4 py-2.5 text-sm transition-colors',
                            active ? 'text-teal-400 bg-teal-500/10' : 'text-zinc-300 hover:bg-zinc-700'
                          )}
                        >
                          <Icon className="h-4 w-4 flex-shrink-0" />
                          {item.label}
                        </button>
                      )
                    })}
                  </div>
                ))}
                {groupedExtras.ungrouped.length > 0 && (
                  <>
                    {groupedExtras.groups.length > 0 && <div className="border-t border-border my-2" />}
                    {groupedExtras.ungrouped.map(item => {
                      const Icon = item.icon
                      const active = activeSection === item.id
                      return (
                        <button
                          key={item.id}
                          onClick={() => { onSection(item.id); setMoreOpen(false) }}
                          className={cn(
                            'flex items-center gap-3 w-full px-4 py-2.5 text-sm transition-colors',
                            active ? 'text-teal-400 bg-teal-500/10' : 'text-zinc-300 hover:bg-zinc-700'
                          )}
                        >
                          <Icon className="h-4 w-4 flex-shrink-0" />
                          {item.label}
                        </button>
                      )
                    })}
                  </>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </nav>
  )
}
