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

export function MobileNav() {
  const [open, setOpen] = useState(false)

  return (
    <>
      {/* Hamburger button - only visible on mobile */}
      <button
        onClick={() => setOpen(!open)}
        className="mk-hide-desktop"
        aria-label="Abrir menú"
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
        }}
      >
        <div style={{ padding: '0 clamp(16px, 4vw, 32px)' }}>
          {navLinks.map(l => (
            <Link
              key={l.href}
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
          ))}

          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '20px', paddingBottom: '8px' }}>
            <a
              href="https://opai.gard.cl"
              target="_blank"
              rel="noopener"
              className="mk-btn-ghost"
              style={{ justifyContent: 'center', width: '100%', textAlign: 'center' }}
            >
              Iniciar sesión
            </a>
            <Link
              href="/registrarse"
              onClick={() => setOpen(false)}
              className="mk-btn-primary"
              style={{ justifyContent: 'center', width: '100%', textAlign: 'center' }}
            >
              Comenzar gratis — 30 días →
            </Link>
          </div>
        </div>
      </div>
    </>
  )
}
