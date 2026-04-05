'use client'

import { useState } from 'react'
import Link from 'next/link'

const navLinks = [
  { href: '/funcionalidades', label: 'Funcionalidades' },
  { href: '/planes', label: 'Planes' },
  { href: '/blog', label: 'Blog' },
  { href: '/nosotros', label: 'Nosotros' },
  { href: '/contacto', label: 'Contacto' },
]

const funcSubItems = [
  { href: '/funcionalidades/ia-operacional', label: 'IA Operacional' },
  { href: '/control-rondas-gps', label: 'Control de Rondas GPS' },
  { href: '/funcionalidades/face-id', label: 'Face ID Biom\u00e9trico' },
  { href: '/funcionalidades/alertas-cobertura', label: 'Alertas de Cobertura' },
  { href: '/funcionalidades/portales', label: 'Portales de cliente' },
  { href: '/ia-seguridad-privada', label: 'IA en Seguridad' },
]

export function MobileNav() {
  const [open, setOpen] = useState(false)
  const [funcOpen, setFuncOpen] = useState(false)

  return (
    <>
      {/* Hamburger button - only visible on mobile */}
      <button
        onClick={() => setOpen(!open)}
        className="mk-hide-desktop"
        aria-label="Abrir men\u00fa"
        style={{
          background: 'none',
          border: '1px solid var(--mk-border-h)',
          borderRadius: '4px',
          padding: '8px',
          cursor: 'pointer',
          display: 'flex',
          flexDirection: 'column',
          gap: '4px',
          justifyContent: 'center',
          alignItems: 'center',
          width: '38px',
          height: '38px',
        }}
      >
        <span style={{
          display: 'block', width: '18px', height: '2px', background: 'var(--mk-text)',
          transition: 'all 0.3s',
          transform: open ? 'rotate(45deg) translate(3px, 3px)' : 'none',
        }} />
        <span style={{
          display: 'block', width: '18px', height: '2px', background: 'var(--mk-text)',
          transition: 'all 0.3s',
          opacity: open ? 0 : 1,
        }} />
        <span style={{
          display: 'block', width: '18px', height: '2px', background: 'var(--mk-text)',
          transition: 'all 0.3s',
          transform: open ? 'rotate(-45deg) translate(3px, -3px)' : 'none',
        }} />
      </button>

      {/* Backdrop */}
      {open && (
        <div
          onClick={() => setOpen(false)}
          style={{
            position: 'fixed',
            inset: 0,
            top: '64px',
            background: 'rgba(0,0,0,0.6)',
            zIndex: 98,
          }}
        />
      )}

      {/* Slide-down menu */}
      <div
        className="mk-hide-desktop"
        style={{
          position: 'fixed',
          top: '64px',
          left: 0,
          right: 0,
          background: 'var(--mk-bg)',
          borderBottom: '1px solid var(--mk-border)',
          zIndex: 99,
          transform: open ? 'translateY(0)' : 'translateY(-110%)',
          opacity: open ? 1 : 0,
          transition: 'transform 0.3s ease, opacity 0.2s ease',
          padding: '16px 0',
          maxHeight: 'calc(100vh - 64px)',
          overflowY: 'auto',
        }}
      >
        <div style={{ padding: '0 clamp(16px, 4vw, 32px)' }}>
          {navLinks.map(l => (
            <div key={l.href}>
              {l.href === '/funcionalidades' ? (
                <>
                  <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    borderBottom: '1px solid var(--mk-border)',
                  }}>
                    <Link
                      href={l.href}
                      onClick={() => setOpen(false)}
                      style={{
                        display: 'block', flex: 1,
                        color: 'var(--mk-text)', textDecoration: 'none',
                        fontSize: '1rem', fontWeight: 500,
                        fontFamily: 'var(--mk-font-h)',
                        padding: '14px 0',
                        transition: 'color 0.2s',
                      }}
                    >
                      {l.label}
                    </Link>
                    <button
                      onClick={() => setFuncOpen(v => !v)}
                      aria-expanded={funcOpen}
                      aria-label="Expandir funcionalidades"
                      style={{
                        background: 'none', border: 'none', cursor: 'pointer',
                        padding: '8px', color: 'var(--mk-muted)',
                        transition: 'transform 0.2s',
                        transform: funcOpen ? 'rotate(180deg)' : 'none',
                      }}
                    >
                      <svg width={14} height={14} viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth={2}>
                        <path d="M3 5l4 4 4-4" />
                      </svg>
                    </button>
                  </div>
                  {funcOpen && (
                    <div style={{ paddingLeft: 16 }}>
                      {funcSubItems.map(sub => (
                        <Link
                          key={sub.href}
                          href={sub.href}
                          onClick={() => setOpen(false)}
                          style={{
                            display: 'block',
                            color: 'var(--mk-muted)',
                            textDecoration: 'none',
                            fontSize: '0.88rem',
                            fontWeight: 400,
                            fontFamily: 'var(--mk-font-b)',
                            padding: '10px 0',
                            borderBottom: '1px solid var(--mk-border)',
                            transition: 'color 0.2s',
                          }}
                        >
                          {sub.label}
                        </Link>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <Link
                  href={l.href}
                  onClick={() => setOpen(false)}
                  style={{
                    display: 'block',
                    color: 'var(--mk-text)',
                    textDecoration: 'none',
                    fontSize: '1rem',
                    fontWeight: 500,
                    fontFamily: 'var(--mk-font-h)',
                    padding: '14px 0',
                    borderBottom: '1px solid var(--mk-border)',
                    transition: 'color 0.2s',
                  }}
                >
                  {l.label}
                </Link>
              )}
            </div>
          ))}

          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '20px', paddingBottom: '8px' }}>
            <a
              href="https://opai.gard.cl"
              target="_blank"
              rel="noopener"
              className="mk-btn-ghost"
              style={{ justifyContent: 'center', width: '100%', textAlign: 'center' }}
            >
              Iniciar sesi\u00f3n
            </a>
            <Link
              href="/registrarse"
              onClick={() => setOpen(false)}
              className="mk-btn-primary"
              style={{ justifyContent: 'center', width: '100%', textAlign: 'center' }}
            >
              Comenzar gratis \u2014 30 d\u00edas \u2192
            </Link>
          </div>
        </div>
      </div>
    </>
  )
}
