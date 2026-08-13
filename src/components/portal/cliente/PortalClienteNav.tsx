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

export type NavGroup = 'operacion' | 'servicio' | 'gard'

export const GROUP_LABELS: Record<NavGroup, string> = {
  operacion: 'Operación',
  servicio: 'Servicio',
  gard: 'Gard',
}

const MAIN_TABS: PortalSection[] = [
  'dashboard',
  'rondas',
  'control-acceso',
  'tickets',
  'chat',
]

/** Grupos del sidebar / Más. Incluye todas las secciones actuales. */
export const GROUPED_ITEMS: Record<NavGroup, PortalSection[]> = {
  operacion: [
    'dashboard', 'rondas', 'marcaciones', 'posta', 'personal',
    'instalaciones', 'control-acceso', 'equipamiento', 'desempeno',
    'bitacora', 'supervision',
  ],
  servicio: [
    'tickets', 'chat', 'cotizaciones', 'documentacion', 'protocolos',
    'reportes', 'comparativa', 'encuestas', 'alertas', 'empresa',
  ],
  gard: ['nosotros', 'presentacion'],
}

type NavItem = {
  label: string
  icon: LucideIcon
  configKey?: keyof PortalConfig
  requiresPresentation?: boolean
}

export const NAV_ITEMS: Record<PortalSection, NavItem> = {
  'dashboard': { label: 'Inicio', icon: LayoutDashboard, configKey: 'dashboard' },
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

export function isItemVisible(
  section: PortalSection,
  portalConfig: PortalConfig,
  hasActivePresentation?: boolean,
): boolean {
  const item = NAV_ITEMS[section]
  if (!item) return false
  if (item.configKey && !portalConfig[item.configKey]) return false
  if (item.requiresPresentation && !hasActivePresentation) return false
  return true
}

export function labelFor(s: PortalSection, isProspect?: boolean): string {
  if (s === 'cotizaciones') return isProspect ? 'Propuesta' : 'Cotizaciones'
  return NAV_ITEMS[s].label
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

  const visibleMain = MAIN_TABS.filter((s) =>
    isItemVisible(s, portalConfig, hasActivePresentation),
  )

  const items: PlatformNavItem<NavId>[] = [
    ...visibleMain.map((id) => ({
      id: id as NavId,
      label: labelFor(id, isProspect),
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
          className="fixed right-3 bg-card opai-glass-strong-m border border-ds-border-default rounded-xl shadow-xl py-2 min-w-[200px] max-w-[calc(100vw-2rem)] max-h-[70vh] overflow-y-auto z-[60]"
          style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 88px)' }}
        >
          {(Object.keys(GROUPED_ITEMS) as NavGroup[]).map((group, gIdx) => {
            const groupItems = GROUPED_ITEMS[group].filter((s) =>
              isItemVisible(s, portalConfig, hasActivePresentation),
            )
            if (groupItems.length === 0) return null
            const gard = group === 'gard'
            return (
              <div key={group}>
                {gIdx > 0 && <div className="border-t border-ds-border-subtle my-2" />}
                <p className={cn(
                  'px-4 py-1 text-[12px] uppercase tracking-wider font-medium',
                  gard ? 'text-tint-orange-fg' : 'text-ds-text-3',
                )}>
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
                        'flex items-center gap-3 w-full px-4 py-2.5 text-sm min-h-11 transition-colors',
                        active
                          ? gard
                            ? 'text-tint-orange-fg bg-tint-orange'
                            : 'text-primary bg-primary/10'
                          : 'text-ds-text-3 hover:bg-ds-surface-2',
                      )}
                    >
                      <Icon className="h-4 w-4 flex-shrink-0" />
                      {labelFor(id, isProspect)}
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
