'use client'

import { useEffect } from 'react'
import {
  Shield, Cpu, Scale, Award, BadgeCheck, Monitor,
} from 'lucide-react'

const SECTIONS = [
  {
    icon: Shield,
    title: 'Seguridad Integral',
    color: 'text-teal-400',
    bg: 'bg-teal-500/10',
    border: 'border-teal-500/15',
    items: [
      'Guardias seleccionados con evaluación psicométrica y verificación de antecedentes',
      'Protocolos operativos diseñados para cada tipo de instalación',
      'Supervisión presencial + remota con verificación GPS',
      'Cobertura 24/7 con planes de contingencia activos',
    ],
  },
  {
    icon: Cpu,
    title: 'Tecnología OPAI',
    color: 'text-violet-400',
    bg: 'bg-violet-500/10',
    border: 'border-violet-500/15',
    items: [
      'Plataforma propia — no usamos software genérico',
      'Rondas GPS con geofencing y verificación en tiempo real',
      'Trust Score: evaluación objetiva de cada guardia basada en datos',
      'IA predictiva para detección de patrones y anomalías',
    ],
  },
  {
    icon: Scale,
    title: 'Cumplimiento Normativo',
    color: 'text-blue-400',
    bg: 'bg-blue-500/10',
    border: 'border-blue-500/15',
    items: [
      'OS-10 y documentación actualizada de todos los guardias',
      'Contratos laborales al día con fiscalización interna',
      'Cumplimiento de normativa de seguridad privada vigente',
      'Auditorías internas periódicas con reporte al cliente',
    ],
  },
  {
    icon: Award,
    title: 'Diferenciadores',
    color: 'text-amber-400',
    bg: 'bg-amber-500/10',
    border: 'border-amber-500/15',
    items: [
      'Única empresa en Chile con sistema operativo propio de seguridad',
      'Transparencia total: el cliente ve todo en tiempo real',
      'Sin subcontratación — todos los guardias son nuestros',
      'Modelo de mejora continua basado en datos operacionales',
    ],
  },
  {
    icon: BadgeCheck,
    title: 'Certificaciones',
    color: 'text-emerald-400',
    bg: 'bg-emerald-500/10',
    border: 'border-emerald-500/15',
    items: [
      'Empresa de seguridad autorizada por OS-10 de Carabineros',
      'Procesos alineados con estándares ISO 9001',
      'Personal certificado en primeros auxilios y emergencias',
      'Capacitación continua con evaluación de desempeño',
    ],
  },
  {
    icon: Monitor,
    title: 'Portal del Cliente',
    color: 'text-sky-400',
    bg: 'bg-sky-500/10',
    border: 'border-sky-500/15',
    items: [
      'Acceso 24/7 a métricas, reportes y documentación',
      'Chat directo con tu ejecutivo sin intermediarios',
      'Control de acceso digital con registro de visitas',
      'Encuestas de satisfacción y sistema de tickets',
    ],
  },
]

const STATS = [
  { value: '12+', label: 'Años de experiencia' },
  { value: '150+', label: 'Clientes activos' },
  { value: '2.500+', label: 'Guardias operando' },
  { value: '97%', label: 'Retención de clientes' },
]

interface Props {
  contactId?: string
}

export function CompanyPresentationView({ contactId }: Props) {
  useEffect(() => {
    if (!contactId) return
    fetch('/api/portal/cliente/presentation-view', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contactId }),
    }).catch(() => {})
  }, [contactId])

  return (
    <div className="px-4 py-6 pb-24 max-w-4xl mx-auto w-full space-y-8">
      {/* Hero */}
      <div className="text-center space-y-3">
        <img
          src="/logo-gard-blanco.svg"
          alt="Gard Security"
          className="h-10 mx-auto opacity-90"
        />
        <h1
          className="text-2xl sm:text-3xl font-bold text-white"
          style={{ fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif" }}
        >
          Gard Security
        </h1>
        <p className="text-sm text-zinc-400 max-w-md mx-auto leading-relaxed">
          Seguridad privada con tecnología propia. El único sistema operativo integral
          de seguridad en Chile.
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {STATS.map((stat) => (
          <div
            key={stat.label}
            className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 text-center"
          >
            <p className="text-2xl font-bold text-teal-400 tabular-nums">{stat.value}</p>
            <p className="text-[11px] text-zinc-400 mt-1">{stat.label}</p>
          </div>
        ))}
      </div>

      {/* Sections */}
      <div className="space-y-4">
        {SECTIONS.map((section) => {
          const Icon = section.icon
          return (
            <div
              key={section.title}
              className={`rounded-xl border ${section.border} bg-white/[0.02] p-5`}
            >
              <div className="flex items-center gap-3 mb-4">
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${section.bg}`}>
                  <Icon className={`w-5 h-5 ${section.color}`} />
                </div>
                <h3 className="text-base font-semibold text-white">{section.title}</h3>
              </div>
              <ul className="space-y-2">
                {section.items.map((item, i) => (
                  <li key={i} className="flex items-start gap-2.5 text-sm text-zinc-300 leading-relaxed">
                    <span className={`mt-1.5 w-1.5 h-1.5 rounded-full shrink-0 ${section.bg} ${section.color}`} />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          )
        })}
      </div>

      {/* Footer */}
      <div
        className="rounded-2xl border border-white/[0.06] p-6 text-center"
        style={{ background: 'linear-gradient(145deg, rgba(30,41,59,0.8), rgba(26,35,50,0.8))' }}
      >
        <p className="text-xs text-zinc-400 leading-relaxed">
          Gard Security · Plataforma{' '}
          <span className="font-medium text-zinc-300">OPAI</span> · Desarrollado por{' '}
          <a
            href="https://lx3.ai"
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-2 hover:text-zinc-200 transition-colors"
          >
            LX3.ai
          </a>
        </p>
      </div>
    </div>
  )
}
