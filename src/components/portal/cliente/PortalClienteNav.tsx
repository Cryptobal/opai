'use client'

import {
  LayoutDashboard, Building2, MapPin, BookOpen, MessageSquare, Ticket,
  FileText, Receipt, BarChart3, GitCompare, Bell, MoreHorizontal, ClipboardList,
  UserCheck, FileCheck2, Building, Briefcase
} from 'lucide-react'
import { PortalConfig } from '@/lib/portal-cliente-types'
import { cn } from '@/lib/utils'
import { useState } from 'react'

export type PortalSection =
  | 'dashboard' | 'instalaciones' | 'rondas' | 'posta' | 'chat'
  | 'tickets' | 'documentacion' | 'cotizaciones'
  | 'reportes' | 'comparativa' | 'alertas' | 'encuestas'
  | 'personal' | 'propuesta' | 'nosotros' | 'empresa'

const ALL_NAV_ITEMS: Array<{
  id: PortalSection
  label: string
  icon: React.ComponentType<{ className?: string }>
  configKey?: keyof PortalConfig
  prospectOnly?: boolean
}> = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, configKey: 'dashboard' },
  { id: 'instalaciones', label: 'Instalaciones', icon: Building2, configKey: 'guardias' },
  { id: 'rondas', label: 'Rondas', icon: MapPin, configKey: 'rondas' },
  { id: 'posta', label: 'Posta', icon: BookOpen, configKey: 'posta' },
  { id: 'chat', label: 'Chat', icon: MessageSquare, configKey: 'chat_instalacion' },
  { id: 'tickets', label: 'Tickets', icon: Ticket, configKey: 'tickets' },
  { id: 'documentacion', label: 'Documentos', icon: FileText, configKey: 'documentacion' },
  { id: 'cotizaciones', label: 'Cotizaciones', icon: Receipt, configKey: 'cotizaciones' },
  { id: 'reportes', label: 'Reportes', icon: BarChart3, configKey: 'reportes' },
  { id: 'comparativa', label: 'Comparativa', icon: GitCompare, configKey: 'comparativa' },
  { id: 'encuestas', label: 'Encuestas', icon: ClipboardList, configKey: 'encuestas' },
  { id: 'alertas', label: 'Alertas', icon: Bell, configKey: 'alertas' },
  { id: 'personal', label: 'Personal', icon: UserCheck },
  { id: 'propuesta', label: 'Propuesta', icon: FileCheck2, prospectOnly: true },
  { id: 'nosotros', label: 'Nosotros', icon: Building, prospectOnly: true },
  { id: 'empresa', label: 'Empresa', icon: Briefcase },
]

interface Props {
  portalConfig: PortalConfig
  activeSection: PortalSection
  onSection: (s: PortalSection) => void
  isProspect?: boolean
}

// Fixed 4 tabs for prospect mode per spec: Inicio, Propuesta, Nosotros, Chat
const PROSPECT_MAIN_IDS: PortalSection[] = ['dashboard', 'propuesta', 'nosotros', 'chat']

export function PortalClienteNav({ portalConfig, activeSection, onSection, isProspect }: Props) {
  const [moreOpen, setMoreOpen] = useState(false)

  const visibleItems = ALL_NAV_ITEMS.filter(item => {
    // Hide prospect-only items when not in prospect mode
    if (item.prospectOnly && !isProspect) return false
    // Hide config-gated items that are disabled
    if (item.configKey && !portalConfig[item.configKey]) return false
    return true
  })

  // Prospect mode: fixed 4 tabs with no "More" menu
  const mainItems = isProspect
    ? ALL_NAV_ITEMS.filter(item => PROSPECT_MAIN_IDS.includes(item.id))
    : visibleItems.slice(0, 4)
  const extraItems = isProspect
    ? []
    : visibleItems.slice(4)
  const hasExtra = extraItems.length > 0

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white/95 dark:bg-zinc-900/95 backdrop-blur border-t border-zinc-200 dark:border-zinc-800 z-50 safe-area-pb">
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
                  ? 'text-teal-600 dark:text-teal-400 bg-teal-500/10'
                  : 'text-zinc-400 dark:text-zinc-500 hover:text-zinc-600 dark:hover:text-zinc-300 active:bg-zinc-100 dark:active:bg-zinc-800'
              )}
            >
              <Icon className="h-5 w-5" />
              <span className="text-[10px] leading-tight font-medium">{item.label}</span>
            </button>
          )
        })}

        {hasExtra && (
          <div className="relative">
            <button
              onClick={() => setMoreOpen(!moreOpen)}
              className={cn(
                'flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-xl transition-all min-w-[56px]',
                moreOpen || extraItems.some(i => i.id === activeSection)
                  ? 'text-teal-600 dark:text-teal-400 bg-teal-500/10'
                  : 'text-zinc-400 dark:text-zinc-500 hover:text-zinc-600 dark:hover:text-zinc-300 active:bg-zinc-100 dark:active:bg-zinc-800'
              )}
            >
              <MoreHorizontal className="h-5 w-5" />
              <span className="text-[10px] leading-tight font-medium">Mas</span>
            </button>
            {moreOpen && (
              <div className="absolute bottom-14 right-0 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl shadow-xl py-2 min-w-[160px] z-10">
                {extraItems.map(item => {
                  const Icon = item.icon
                  const active = activeSection === item.id
                  return (
                    <button
                      key={item.id}
                      onClick={() => { onSection(item.id); setMoreOpen(false) }}
                      className={cn(
                        'flex items-center gap-3 w-full px-4 py-2.5 text-sm transition-colors',
                        active ? 'text-teal-600 dark:text-teal-400 bg-teal-500/10' : 'text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-700'
                      )}
                    >
                      <Icon className="h-4 w-4 flex-shrink-0" />
                      {item.label}
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </nav>
  )
}
