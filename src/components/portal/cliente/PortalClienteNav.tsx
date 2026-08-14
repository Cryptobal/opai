'use client'

import {
  LayoutDashboard, Building2, MapPin, BookOpen, MessageSquare, Ticket,
  FileText, Receipt, BarChart3, GitCompare, Bell, MoreHorizontal, ClipboardList,
  UserCheck, Building, Briefcase, ShieldCheck, TrendingUp, Package, FileCheck2, Eye,
  type LucideIcon,
} from 'lucide-react'
import { PortalConfig } from '@/lib/portal-cliente-types'
import { cn } from '@/lib/utils'
import { useState } from 'react'
import { PlatformAwareBottomNav, type NavItem as PlatformNavItem } from '@/components/opai/portal-shell'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'

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

const SKIP_MAIN: ReadonlySet<PortalSection> = new Set(['instalacion-detalle', 'propuesta'])

const MAIN_TAB_PREFERRED: PortalSection[] = [
  'dashboard',
  'rondas',
  'personal',
  'tickets',
]

/** 4 tabs visibles: sustituye slots ocultos por el siguiente ítem visible. */
export function resolveMainTabs(
  portalConfig: PortalConfig,
  isProspect?: boolean,
  hasActivePresentation?: boolean,
): PortalSection[] {
  const preferred: PortalSection[] = [
    'dashboard',
    'rondas',
    'personal',
    isProspect ? 'cotizaciones' : 'tickets',
  ]
  const visible = (s: PortalSection) => isItemVisible(s, portalConfig, hasActivePresentation)
  const result: PortalSection[] = []
  const used = new Set<PortalSection>()
  for (const s of preferred) {
    if (visible(s) && !used.has(s)) {
      result.push(s)
      used.add(s)
    }
  }
  if (result.length < 4) {
    const fallback = [
      ...MAIN_TAB_PREFERRED,
      ...GROUPED_ITEMS.operacion,
      ...GROUPED_ITEMS.servicio,
      ...GROUPED_ITEMS.gard,
    ]
    for (const s of fallback) {
      if (result.length >= 4) break
      if (SKIP_MAIN.has(s) || !visible(s) || used.has(s)) continue
      result.push(s)
      used.add(s)
    }
  }
  return result
}

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
  const visibleMain = resolveMainTabs(portalConfig, isProspect, hasActivePresentation)

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
          if (id === 'more') setMoreOpen(true)
          else {
            onSection(id)
            setMoreOpen(false)
          }
        }}
      />
      <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
        <SheetContent
          side="bottom"
          surface="glass-island"
          overlayClassName="bg-black/35"
          className="max-h-[min(80dvh,640px)] overflow-y-auto px-4 pt-4"
        >
          <SheetHeader className="text-left mb-3">
            <SheetTitle className="font-display text-ds-title">Más secciones</SheetTitle>
          </SheetHeader>
          <div className="space-y-4 pb-[max(env(safe-area-inset-bottom),1.5rem)]">
            {(Object.keys(GROUPED_ITEMS) as NavGroup[]).map((group) => {
              const groupItems = GROUPED_ITEMS[group].filter((s) =>
                isItemVisible(s, portalConfig, hasActivePresentation),
              )
              if (groupItems.length === 0) return null
              const gard = group === 'gard'
              return (
                <div key={group}>
                  <p className={cn(
                    'px-1 mb-1.5 text-ds-caption font-semibold uppercase tracking-wider',
                    gard ? 'text-tint-orange-fg' : 'text-ds-text-3',
                  )}>
                    {GROUP_LABELS[group]}
                  </p>
                  <div className="grid grid-cols-1 gap-0.5">
                    {groupItems.map((id) => {
                      const Icon = NAV_ITEMS[id].icon
                      const active = activeSection === id
                      return (
                        <button
                          key={id}
                          type="button"
                          onClick={() => {
                            onSection(id)
                            setMoreOpen(false)
                          }}
                          className={cn(
                            'flex items-center gap-3 w-full px-3 min-h-11 rounded-xl text-sm transition-colors',
                            active
                              ? gard
                                ? 'text-tint-orange-fg bg-tint-orange'
                                : 'text-primary bg-primary/10'
                              : 'text-ds-text-2 hover:bg-ds-surface-2',
                          )}
                        >
                          <Icon className="h-4 w-4 shrink-0" />
                          {labelFor(id, isProspect)}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        </SheetContent>
      </Sheet>
    </>
  )
}
