'use client'

import { cn } from '@/lib/utils'
import { PortalConfig } from '@/lib/portal-cliente-types'
import {
  GROUP_LABELS,
  GROUPED_ITEMS,
  NAV_ITEMS,
  isItemVisible,
  labelFor,
  type NavGroup,
  type PortalSection,
} from './PortalClienteNav'

interface Props {
  portalConfig: PortalConfig
  activeSection: PortalSection
  onSection: (s: PortalSection) => void
  isProspect?: boolean
  hasActivePresentation?: boolean
}

const DETAIL_PARENT: Partial<Record<PortalSection, PortalSection>> = {
  'instalacion-detalle': 'instalaciones',
  propuesta: 'cotizaciones',
}

export function PortalSidebar({
  portalConfig,
  activeSection,
  onSection,
  isProspect,
  hasActivePresentation,
}: Props) {
  const resolvedActive = DETAIL_PARENT[activeSection] ?? activeSection

  return (
    <aside
      className={cn(
        'hidden md:flex flex-col shrink-0 h-dvh sticky top-0 z-30',
        'w-[76px] min-[1240px]:w-[250px]',
        'border-r border-ds-border-subtle bg-ds-surface-1',
      )}
      aria-label="Navegación del portal"
    >
      <div className="flex-1 overflow-y-auto py-3 px-2 min-[1240px]:px-3 space-y-4">
        {(Object.keys(GROUPED_ITEMS) as NavGroup[]).map((group) => {
          const items = GROUPED_ITEMS[group].filter((s) =>
            isItemVisible(s, portalConfig, hasActivePresentation),
          )
          if (items.length === 0) return null
          const gard = group === 'gard'
          return (
            <div key={group}>
              <p
                className={cn(
                  'hidden min-[1240px]:block px-2 mb-1.5 text-[12px] font-semibold uppercase tracking-wider',
                  gard ? 'text-tint-orange-fg' : 'text-ds-text-4',
                )}
              >
                {GROUP_LABELS[group]}
              </p>
              <nav className="space-y-0.5">
                {items.map((id) => {
                  const item = NAV_ITEMS[id]
                  const Icon = item.icon
                  const active = resolvedActive === id
                  const label = labelFor(id, isProspect)
                  return (
                    <button
                      key={id}
                      type="button"
                      title={label}
                      onClick={() => onSection(id)}
                      className={cn(
                        'relative flex items-center gap-3 w-full min-h-11 rounded-xl px-2.5 text-sm transition-colors',
                        'justify-center min-[1240px]:justify-start',
                        active && !gard && 'bg-primary/10 text-primary',
                        active && gard && 'bg-tint-orange text-tint-orange-fg',
                        !active && 'text-ds-text-3 hover:bg-ds-surface-2 hover:text-ds-text-1',
                      )}
                    >
                      {active && (
                        <span
                          aria-hidden
                          className={cn(
                            'absolute left-0 top-1/2 -translate-y-1/2 h-5 w-0.5 rounded-full',
                            gard ? 'bg-tint-orange-fg' : 'bg-primary',
                          )}
                        />
                      )}
                      <Icon className="h-5 w-5 shrink-0" strokeWidth={active ? 2.4 : 2} />
                      <span className="hidden min-[1240px]:inline truncate">{label}</span>
                    </button>
                  )
                })}
              </nav>
            </div>
          )
        })}
      </div>
    </aside>
  )
}
