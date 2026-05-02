'use client'

import {
  LayoutDashboard, Building2, MapPin, BookOpen, MessageSquare, Ticket,
  FileText, Receipt, BarChart3, GitCompare, Bell, MoreHorizontal, ClipboardList,
  UserCheck, Building, Briefcase, ShieldCheck, TrendingUp, Package, FileCheck2, Eye,
  type LucideIcon,
} from 'lucide-react'
import { PortalConfig } from '@/lib/portal-cliente-types'
import { cn } from '@/lib/utils'
import { useEffect, useRef, useState } from 'react'
import { PlatformAwareBottomNav, type NavItem as PlatformNavItem } from '@/components/opai/portal-shell'

export type PortalSection =
  | 'dashboard' | 'instalaciones' | 'instalacion-detalle' | 'rondas' | 'posta' | 'chat'
  | 'tickets' | 'documentacion' | 'cotizaciones' | 'protocolos'
  | 'reportes' | 'comparativa' | 'alertas' | 'encuestas'
  | 'desempeno' | 'personal' | 'nosotros' | 'empresa'
  | 'control-acceso' | 'presentacion' | 'marcaciones' | 'equipamiento'
  | 'bitacora' | 'supervision'
  | 'propuesta'

type NavGroup = 'operaciones' | 'mensajes' | 'analisis' | 'documentos' | 'proveedor'

const GROUP_LABELS: Record<NavGroup, string> = {
  operaciones: 'Operaciones',
  mensajes: 'Mensajes',
  analisis: 'Análisis',
  documentos: 'Documentos',
  proveedor: 'Mi Proveedor',
}

const MAIN_TABS: PortalSection[] = [
  'dashboard',
  'rondas',
  'control-acceso',
  'tickets',
  'chat',
]

const GROUPED_ITEMS: Record<NavGroup, PortalSection[]> = {
  operaciones: ['personal', 'instalaciones', 'marcaciones', 'posta', 'bitacora', 'supervision', 'equipamiento', 'desempeno'],
  mensajes: ['alertas', 'encuestas'],
  analisis: ['reportes', 'comparativa'],
  documentos: ['documentacion', 'cotizaciones'],
  proveedor: ['empresa', 'nosotros', 'presentacion'],
}

type NavItem = {
  label: string
  icon: LucideIcon
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
  'personal': { label: 'Equipo', icon: UserCheck },
  'bitacora': { label: 'Bitácora ejecutiva', icon: BookOpen, configKey: 'posta' },
  'supervision': { label: 'Supervisión', icon: Eye },
  'propuesta': { label: 'Propuesta', icon: FileCheck2 },
}

interface Props {
  portalConfig: PortalConfig
  activeSection: PortalSection
  onSection: (s: PortalSection) => void
  isProspect?: boolean
  hasActivePresentation?: boolean
}

type NavId = PortalSection | 'more'

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

  const items: PlatformNavItem<NavId>[] = [
    ...visibleMain.map((id) => ({
      id: id as NavId,
      label: labelFor(id),
      icon: NAV_ITEMS[id].icon,
    })),
    { id: 'more', label: 'Más', icon: MoreHorizontal },
  ]

  const activeId: NavId = moreOpen
    ? 'more'
    : (visibleMain.includes(activeSection) ? activeSection : 'more')

  return (
    <>
      <PlatformAwareBottomNav
        items={items}
        activeId={activeId}
        onSelect={(id) => {
          if (id === 'more') {
            setMoreOpen((prev) => !prev)
          } else {
            onSection(id)
            setMoreOpen(false)
          }
        }}
      />
      {moreOpen && (
        <div
          ref={moreRef}
          className="fixed right-3 bg-zinc-800 border border-zinc-700 rounded-xl shadow-xl py-2 min-w-[200px] max-w-[calc(100vw-2rem)] max-h-[70vh] overflow-y-auto z-[60]"
          style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 88px)' }}
        >
          {(Object.keys(GROUPED_ITEMS) as NavGroup[]).map((group, gIdx) => {
            const groupItems = GROUPED_ITEMS[group].filter(isItemVisible)
            if (groupItems.length === 0) return null
            return (
              <div key={group}>
                {gIdx > 0 && <div className="border-t border-zinc-700 my-2" />}
                <p className="px-4 py-1 text-[10px] text-zinc-500 uppercase tracking-wider font-medium">
                  {GROUP_LABELS[group]}
                </p>
                {groupItems.map((id) => {
                  const item = NAV_ITEMS[id]
                  const Icon = item.icon
                  const active = activeSection === id
                  return (
                    <button
                      key={id}
                      onClick={() => {
                        onSection(id)
                        setMoreOpen(false)
                      }}
                      className={cn(
                        'flex items-center gap-3 w-full px-4 py-2.5 text-sm transition-colors',
                        active ? 'text-status-info-fg bg-status-info-soft' : 'text-zinc-300 hover:bg-zinc-700',
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
    </>
  )
}
