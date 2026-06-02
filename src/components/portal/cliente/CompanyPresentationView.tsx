'use client'

import { useEffect, useState } from 'react'
import {
  Shield, Cpu, Scale, Award, BadgeCheck, Monitor, Sparkles,
  LayoutDashboard, ArrowRight, Check, Loader2, type LucideIcon,
} from 'lucide-react'
import { useBranding } from '@/lib/branding/useBranding'
import { GardServiceIncludes } from '@/components/portal/cliente/cotizaciones/GardServiceIncludes'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { GARD_PRESENTATION_CONTENT } from '@/lib/tenant-presentation-defaults'
import type { PresentationContent } from '@/lib/tenant-presentation'

/** Iniciales (1-2 letras) para el monograma de clientes sin logo. */
function clientInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean)
  const letters = words.slice(0, 2).map((w) => w[0]).join('')
  return (letters || name.slice(0, 2)).toUpperCase()
}

const MONOGRAM_COLORS = [
  '#0d9488', '#4f46e5', '#db2777', '#d97706',
  '#7c3aed', '#059669', '#0284c7', '#e11d48',
]

/** Color determinístico del monograma a partir del nombre. */
function monogramColor(name: string): string {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0
  return MONOGRAM_COLORS[h % MONOGRAM_COLORS.length]
}

/**
 * Paleta + ícono por `key` de sección. El contenido (texto) llega tenant-driven
 * desde la BD; el estilo se asocia acá para mantener consistencia visual y
 * porque un componente React no puede serializarse en JSON.
 * Las keys desconocidas caen al estilo neutro `DEFAULT_STYLE`.
 */
const SECTION_STYLES: Record<
  string,
  { icon: LucideIcon; color: string; bg: string; border: string }
> = {
  seguridad: {
    icon: Shield,
    color: 'text-status-info-fg',
    bg: 'bg-status-info-soft',
    border: 'border-status-info-border',
  },
  tecnologia: {
    icon: Cpu,
    color: 'text-violet-400',
    bg: 'bg-violet-500/10',
    border: 'border-violet-500/15',
  },
  cumplimiento: {
    icon: Scale,
    color: 'text-status-info-fg',
    bg: 'bg-status-info-soft',
    border: 'border-status-info-border',
  },
  diferenciadores: {
    icon: Award,
    color: 'text-status-warn-fg',
    bg: 'bg-status-warn-soft',
    border: 'border-status-warn-border',
  },
  certificaciones: {
    icon: BadgeCheck,
    color: 'text-status-ok-fg',
    bg: 'bg-status-ok-soft',
    border: 'border-status-ok-border',
  },
  portal: {
    icon: Monitor,
    color: 'text-status-info-fg',
    bg: 'bg-status-info-soft',
    border: 'border-status-info-border',
  },
}

const DEFAULT_STYLE = {
  icon: Sparkles,
  color: 'text-status-info-fg',
  bg: 'bg-status-info-soft',
  border: 'border-status-info-border',
}

interface Props {
  contactId?: string
}

export function CompanyPresentationView({ contactId }: Props) {
  const { branding } = useBranding()
  const [content, setContent] = useState<PresentationContent>(GARD_PRESENTATION_CONTENT)
  const [clients, setClients] = useState<{ name: string; logoUrl: string | null }[]>([])
  const [requesting, setRequesting] = useState(false)
  const [requested, setRequested] = useState(false)

  // Registrar la vista (analytics) — comportamiento existente
  useEffect(() => {
    if (!contactId) return
    fetch('/api/portal/cliente/presentation-view', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contactId }),
    }).catch(() => {})
  }, [contactId])

  // Cargar contenido del tenant (fallback a defaults Gard mientras llega)
  useEffect(() => {
    let active = true
    fetch('/api/portal/cliente/presentation-content')
      .then((r) => r.json())
      .then((json) => {
        if (active && json?.success && json.data) {
          setContent(json.data as PresentationContent)
        }
      })
      .catch(() => {})
    return () => {
      active = false
    }
  }, [])

  // Muro de clientes (prueba social) — solo nombre + logo
  useEffect(() => {
    let active = true
    fetch('/api/portal/cliente/clientes-destacados')
      .then((r) => r.json())
      .then((json) => {
        if (active && json?.success && Array.isArray(json.data)) {
          setClients(json.data)
        }
      })
      .catch(() => {})
    return () => {
      active = false
    }
  }, [])

  const requestProposal = async () => {
    if (requesting || requested) return
    setRequesting(true)
    try {
      const res = await fetch('/api/portal/cliente/solicitar-propuesta', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      const json = await res.json().catch(() => ({}))
      if (res.ok && json?.success) {
        setRequested(true)
      }
    } catch {
      /* silencioso: el cliente puede reintentar */
    } finally {
      setRequesting(false)
    }
  }

  return (
    <div className="px-4 py-6 pb-24 max-w-4xl mx-auto w-full space-y-8">
      {/* Hero */}
      <div
        className="relative overflow-hidden rounded-2xl border border-white/[0.06] p-8 text-center"
        style={{
          background:
            'radial-gradient(120% 120% at 50% 0%, rgba(20,184,166,0.12), rgba(15,23,42,0) 60%), linear-gradient(180deg, rgba(30,41,59,0.6), rgba(15,23,42,0.6))',
        }}
      >
        {branding.logoWhite && (
          <img
            src={branding.logoWhite}
            alt={branding.companyName}
            className="h-10 mx-auto opacity-90 mb-4"
          />
        )}
        <p className="text-[11px] font-semibold uppercase tracking-[2px] text-teal-400 mb-3">
          Presentación de empresa
        </p>
        <h1
          className="text-2xl sm:text-3xl font-bold text-white"
          style={{ fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif" }}
        >
          {branding.companyName}
        </h1>
        <p className="mt-3 text-sm text-zinc-300/90 max-w-lg mx-auto leading-relaxed">
          {content.valueProp}
        </p>
        <div className="mt-6">
          <ProposalCta
            requesting={requesting}
            requested={requested}
            onClick={requestProposal}
          />
        </div>
      </div>

      {/* Banner: el medio es el mensaje */}
      <div className="flex items-start gap-3 rounded-xl border border-teal-500/20 bg-teal-500/[0.07] p-4">
        <div className="w-9 h-9 rounded-lg bg-teal-500/15 flex items-center justify-center shrink-0">
          <LayoutDashboard className="w-5 h-5 text-teal-300" />
        </div>
        <div>
          <p className="text-sm font-semibold text-white">
            Esto que estás usando ahora mismo es nuestro portal de cliente
          </p>
          <p className="text-xs text-zinc-400 mt-1 leading-relaxed">
            Así de claras y en tiempo real verás tus operaciones, rondas, reportes y documentos
            cuando trabajemos juntos. Sin llamadas para pedir información: todo, siempre, a un clic.
          </p>
        </div>
      </div>

      {/* Stats */}
      {content.stats.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {content.stats.map((stat) => (
            <div
              key={stat.label}
              className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 text-center"
            >
              <p className="text-2xl font-bold text-status-info-fg tabular-nums">{stat.value}</p>
              <p className="text-[11px] text-zinc-400 mt-1">{stat.label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Muro de clientes (prueba social) */}
      {clients.length > 0 && (
        <div className="space-y-4">
          <div className="text-center">
            <p className="text-[12px] font-semibold uppercase tracking-[2px] text-teal-400">
              Empresas que confían en nosotros
            </p>
          </div>
          <TooltipProvider delayDuration={120}>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {clients.map((client, i) => (
                <Tooltip key={`${client.name}-${i}`}>
                  <TooltipTrigger asChild>
                    <div className="group flex h-28 cursor-default items-center justify-center rounded-xl border border-white/[0.06] bg-white p-4 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-black/30">
                      {client.logoUrl ? (
                        <img
                          src={client.logoUrl}
                          alt={client.name}
                          loading="lazy"
                          className="max-h-full max-w-full object-contain transition-transform duration-200 group-hover:scale-105"
                        />
                      ) : (
                        <div
                          className="flex h-16 w-16 items-center justify-center rounded-2xl text-xl font-bold text-white shadow-sm"
                          style={{ backgroundColor: monogramColor(client.name) }}
                        >
                          {clientInitials(client.name)}
                        </div>
                      )}
                    </div>
                  </TooltipTrigger>
                  <TooltipContent className="border-white/10 bg-zinc-900 font-medium text-white">
                    {client.name}
                  </TooltipContent>
                </Tooltip>
              ))}
            </div>
          </TooltipProvider>
        </div>
      )}

      {/* Sections */}
      <div className="space-y-4">
        {content.sections.map((section) => {
          const style = SECTION_STYLES[section.key] ?? DEFAULT_STYLE
          const Icon = style.icon
          return (
            <div
              key={section.key}
              className={`rounded-xl border ${style.border} bg-white/[0.02] p-5`}
            >
              <div className="flex items-center gap-3 mb-4">
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${style.bg}`}>
                  <Icon className={`w-5 h-5 ${style.color}`} />
                </div>
                <h3 className="text-base font-semibold text-white">{section.title}</h3>
              </div>
              <ul className="space-y-2">
                {section.items.map((item, i) => (
                  <li key={i} className="flex items-start gap-2.5 text-sm text-zinc-300 leading-relaxed">
                    <span className={`mt-1.5 w-1.5 h-1.5 rounded-full shrink-0 ${style.bg} ${style.color}`} />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          )
        })}
      </div>

      {/* Qué incluye el servicio (tenant-driven) */}
      {content.serviceIncludes.length > 0 && (
        <GardServiceIncludes
          items={content.serviceIncludes}
          brandName={branding.companyName}
        />
      )}

      {/* CTA de cierre */}
      <div
        className="rounded-2xl border border-white/[0.06] p-6 sm:p-8 text-center"
        style={{ background: 'linear-gradient(145deg, rgba(20,184,166,0.10), rgba(26,35,50,0.85))' }}
      >
        <h3 className="text-lg font-semibold text-white">¿Listo para avanzar?</h3>
        <p className="mt-2 text-sm text-zinc-300/90 max-w-md mx-auto leading-relaxed">
          Te preparamos una propuesta a la medida de tu operación, con todo lo que viste acá
          aplicado a tus instalaciones.
        </p>
        <div className="mt-5 flex justify-center">
          <ProposalCta
            requesting={requesting}
            requested={requested}
            onClick={requestProposal}
          />
        </div>
      </div>

      {/* Footer */}
      <div className="text-center">
        <p className="text-xs text-zinc-500 leading-relaxed">
          {branding.companyName} · Plataforma{' '}
          <span className="font-medium text-zinc-400">OPAI</span> · Desarrollado por{' '}
          <a
            href="https://lx3.ai"
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-2 hover:text-zinc-300 transition-colors"
          >
            LX3.ai
          </a>
        </p>
      </div>
    </div>
  )
}

function ProposalCta({
  requesting,
  requested,
  onClick,
}: {
  requesting: boolean
  requested: boolean
  onClick: () => void
}) {
  if (requested) {
    return (
      <div className="inline-flex items-center gap-2 rounded-lg border border-status-ok-border bg-status-ok-soft px-4 py-2.5 text-sm font-medium text-status-ok-fg">
        <Check className="w-4 h-4" />
        ¡Listo! Tu ejecutivo fue notificado y te contactará pronto.
      </div>
    )
  }
  return (
    <button
      onClick={onClick}
      disabled={requesting}
      className="inline-flex items-center gap-2 rounded-lg bg-teal-500 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-teal-400 disabled:opacity-60"
    >
      {requesting ? (
        <Loader2 className="w-4 h-4 animate-spin" />
      ) : (
        <ArrowRight className="w-4 h-4" />
      )}
      Solicitar mi propuesta personalizada
    </button>
  )
}
