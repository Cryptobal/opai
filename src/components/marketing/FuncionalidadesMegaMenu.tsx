'use client'

import { useState, useRef, useCallback } from 'react'
import Link from 'next/link'

const modulosOperativos = [
  { href: '/funcionalidades/ia-operacional', title: 'IA Operacional', desc: 'Alertas predictivas en tiempo real', icon: 'M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5' },
  { href: '/control-rondas-gps', title: 'Control de Rondas GPS', desc: 'Verificación con foto y geolocalización', icon: 'M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5a2.5 2.5 0 110-5 2.5 2.5 0 010 5z' },
  { href: '/funcionalidades/face-id', title: 'Face ID Biométrico', desc: 'Marcaciones sin fraude ni manipulación', icon: 'M9 11a3 3 0 106 0 3 3 0 00-6 0zm3 8c-3.31 0-6-1.34-6-3s2.69-3 6-3 6 1.34 6 3-2.69 3-6 3z' },
  { href: '/funcionalidades/alertas-cobertura', title: 'Alertas de Cobertura', desc: 'WhatsApp automático ante ausencias', icon: 'M12 22c1.1 0 2-.9 2-2h-4c0 1.1.9 2 2 2zm6-6v-5c0-3.07-1.63-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.64 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z' },
  { href: '/funcionalidades/portales', title: 'Portales de cliente', desc: 'Acceso transparente al servicio 24/7', icon: 'M4 6h16M4 12h16M4 18h16' },
  { href: '/ia-seguridad-privada', title: 'IA en Seguridad', desc: 'Automatización operacional con IA real', icon: 'M13 2L3 14h9l-1 8 10-12h-9l1-8z' },
]

const plataformaERP = [
  { href: '/funcionalidades', title: 'Vista general', desc: 'El único ERP para seguridad privada en Chile', icon: 'M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z' },
  { href: '/funcionalidades', title: 'CRM y Cotizaciones', desc: 'Pipeline comercial y propuestas profesionales', icon: 'M16 8a6 6 0 01-12 0M12 2v6m0 0l3-3m-3 3L9 5' },
  { href: '/funcionalidades', title: 'Finanzas y Nómina', desc: 'Liquidaciones OS10, facturación electrónica', icon: 'M12 1v22M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6' },
  { href: '/integraciones', title: 'Integraciones', desc: 'Fintoc, SII, SimpleFactura y más', icon: 'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01' },
]

function ItemIcon({ d }: { d: string }) {
  return (
    <div style={{
      width: 32, height: 32, borderRadius: 6,
      background: 'var(--mk-teal-dim)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      flexShrink: 0,
    }}>
      <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="var(--mk-teal)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <path d={d} />
      </svg>
    </div>
  )
}

export function FuncionalidadesMegaMenu() {
  const [open, setOpen] = useState(false)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleEnter = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    setOpen(true)
  }, [])

  const handleLeave = useCallback(() => {
    timeoutRef.current = setTimeout(() => setOpen(false), 150)
  }, [])

  const closeMenu = useCallback(() => setOpen(false), [])

  const itemStyle: React.CSSProperties = {
    display: 'flex', alignItems: 'flex-start', gap: 10,
    padding: '8px 10px', borderRadius: 6,
    textDecoration: 'none', color: 'inherit',
    transition: 'background 0.15s',
  }

  return (
    <div onMouseEnter={handleEnter} onMouseLeave={handleLeave} style={{ position: 'relative' }}>
      {/* Trigger */}
      <button
        aria-expanded={open}
        aria-haspopup="true"
        onClick={() => setOpen(v => !v)}
        style={{
          background: 'none', border: 'none', cursor: 'pointer',
          color: open ? 'var(--mk-teal)' : 'var(--mk-muted)',
          fontSize: '0.9rem', fontWeight: 500,
          fontFamily: 'var(--mk-font-b)',
          padding: 0, transition: 'color 0.2s',
          display: 'flex', alignItems: 'center', gap: 4,
        }}
      >
        Funcionalidades
        <svg width={10} height={10} viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth={1.5} style={{ transition: 'transform 0.2s', transform: open ? 'rotate(180deg)' : 'none' }}>
          <path d="M2 4l3 3 3-3" />
        </svg>
      </button>

      {/* Invisible bridge to prevent gap problem */}
      {open && (
        <div style={{ position: 'absolute', top: '100%', left: -20, right: -20, height: 16 }} />
      )}

      {/* Panel */}
      <div
        role="navigation"
        aria-label="Funcionalidades"
        style={{
          position: 'fixed', top: 64, left: 0, right: 0,
          background: 'var(--mk-nav-bg)',
          backdropFilter: 'blur(20px)',
          borderBottom: '1px solid var(--mk-border)',
          zIndex: 99,
          opacity: open ? 1 : 0,
          transform: open ? 'translateY(0)' : 'translateY(-6px)',
          pointerEvents: open ? 'auto' : 'none',
          transition: 'opacity 180ms ease-out, transform 180ms ease-out',
        }}
      >
        <div className="mk-container" style={{
          display: 'grid', gridTemplateColumns: '1fr 1fr',
          gap: 40, padding: '28px clamp(16px, 4vw, 32px)',
        }}>
          {/* Column 1 — Modulos operativos */}
          <div>
            <div style={{
              fontFamily: 'var(--mk-font-h)', fontSize: 11, fontWeight: 600,
              letterSpacing: '0.1em', textTransform: 'uppercase',
              color: 'var(--mk-muted)', marginBottom: 12,
            }}>
              Módulos operativos
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {modulosOperativos.map(item => (
                <Link
                  key={item.href + item.title}
                  href={item.href}
                  onClick={closeMenu}
                  aria-label={item.title}
                  style={itemStyle}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--mk-teal-dim)' }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent' }}
                >
                  <ItemIcon d={item.icon} />
                  <div>
                    <div style={{ fontFamily: 'var(--mk-font-h)', fontSize: 13, fontWeight: 500, color: 'var(--mk-text)', transition: 'color 0.15s' }}
                      className="mega-item-title"
                    >
                      {item.title}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--mk-muted)', marginTop: 1 }}>{item.desc}</div>
                  </div>
                </Link>
              ))}
            </div>
          </div>

          {/* Column 2 — Plataforma ERP + pricing card */}
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <div style={{
              fontFamily: 'var(--mk-font-h)', fontSize: 11, fontWeight: 600,
              letterSpacing: '0.1em', textTransform: 'uppercase',
              color: 'var(--mk-muted)', marginBottom: 12,
            }}>
              Plataforma ERP
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {plataformaERP.map(item => (
                <Link
                  key={item.href + item.title}
                  href={item.href}
                  onClick={closeMenu}
                  aria-label={item.title}
                  style={itemStyle}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--mk-teal-dim)' }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent' }}
                >
                  <ItemIcon d={item.icon} />
                  <div>
                    <div style={{ fontFamily: 'var(--mk-font-h)', fontSize: 13, fontWeight: 500, color: 'var(--mk-text)', transition: 'color 0.15s' }}>
                      {item.title}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--mk-muted)', marginTop: 1 }}>{item.desc}</div>
                  </div>
                </Link>
              ))}
            </div>

          </div>
        </div>
      </div>
    </div>
  )
}
