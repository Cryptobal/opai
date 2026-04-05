import type { Metadata } from 'next'
import Link from 'next/link'
import { Linkedin } from 'lucide-react'
import { MobileNav } from '@/components/marketing/MobileNav'
import { MarketingThemeToggle } from '@/components/marketing/ThemeToggle'
import { FuncionalidadesMegaMenu } from '@/components/marketing/FuncionalidadesMegaMenu'
import './marketing.css'

export const metadata: Metadata = {
  metadataBase: new URL('https://www.opai.cl'),
  title: {
    default: 'OPAI — ERP para Empresas de Seguridad Privada | Chile',
    template: '%s | OPAI',
  },
  description:
    'El único ERP diseñado exclusivamente para empresas de seguridad privada. Operaciones, CRM, Finanzas y Nómina con IA operacional real. Face ID, GPS en tiempo real, alertas WhatsApp automáticas.',
  keywords: [
    'ERP seguridad privada Chile',
    'software empresas guardias',
    'sistema gestión guardias de seguridad',
    'control rondas GPS tiempo real',
    'marcaciones biométricas guardias',
    'nómina guardias seguridad Chile',
    'alertas cobertura WhatsApp seguridad',
    'ERP seguridad privada IA',
    'software OS10 seguridad',
    'gestión empresas seguridad privada',
  ],
  authors: [{ name: 'OPAI', url: 'https://www.opai.cl' }],
  creator: 'OPAI — LX3.ai',
  openGraph: {
    type: 'website',
    locale: 'es_CL',
    url: 'https://www.opai.cl',
    siteName: 'OPAI',
    title: 'OPAI — ERP para Empresas de Seguridad Privada',
    description:
      'Operaciones, CRM, Finanzas y Nómina con IA operacional real. Face ID, GPS en tiempo real, alertas WhatsApp automáticas.',
    images: [{ url: '/og-image.png', width: 1200, height: 630, alt: 'OPAI ERP Seguridad Privada' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'OPAI — ERP para Empresas de Seguridad Privada',
    description: 'El único ERP con IA operacional real para seguridad privada en Chile.',
    images: ['/og-image.png'],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, 'max-video-preview': -1, 'max-image-preview': 'large' },
  },
  alternates: {
    canonical: 'https://www.opai.cl',
  },
}

const navLinks = [
  { href: '/funcionalidades', label: 'Funcionalidades' },
  { href: '/planes', label: 'Planes' },
  { href: '/blog', label: 'Blog' },
  { href: '/nosotros', label: 'Nosotros' },
]

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mk-grid-bg" style={{ background: 'var(--mk-bg)', color: 'var(--mk-text)', minHeight: '100vh', fontFamily: 'var(--mk-font-b)' }}>
      {/* Prevent theme flash — static string, no user input */}
      <script dangerouslySetInnerHTML={{ __html: `(function(){try{var t=localStorage.getItem('mk-theme');if(t)document.documentElement.setAttribute('data-mk-theme',t)}catch(e){}})()` }} />
      {/* NAV */}
      <nav style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100,
        background: 'var(--mk-nav-bg)',
        backdropFilter: 'blur(16px)',
        borderBottom: '1px solid var(--mk-border)',
      }}>
        <div className="mk-container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: '64px' }}>
          <Link href="/" style={{ fontFamily: 'var(--mk-font-h)', fontSize: '1.5rem', fontWeight: 800, color: 'var(--mk-text)', textDecoration: 'none', letterSpacing: '-0.02em' }}>
            OP<span style={{ color: 'var(--mk-teal)' }}>AI</span>
          </Link>
          <div className="mk-hide-mobile" style={{ display: 'flex', alignItems: 'center', gap: '32px' }}>
            <FuncionalidadesMegaMenu />
            {navLinks.filter(l => l.href !== '/funcionalidades').map(l => (
              <Link key={l.href} href={l.href} style={{ color: 'var(--mk-muted)', textDecoration: 'none', fontSize: '0.9rem', fontWeight: 500, transition: 'color 0.2s' }}>
                {l.label}
              </Link>
            ))}
          </div>
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            <MarketingThemeToggle />
            <a href={process.env.NEXT_PUBLIC_APP_URL || "/opai/login"} target="_blank" rel="noopener" className="mk-btn-ghost mk-hide-mobile" style={{ padding: '9px 18px', fontSize: '0.85rem' }}>
              Iniciar sesión
            </a>
            <MobileNav />
          </div>
        </div>
      </nav>

      {/* CONTENT */}
      <main style={{ paddingTop: '64px' }}>{children}</main>

      {/* FOOTER */}
      <footer style={{ borderTop: '1px solid var(--mk-border)', padding: 'clamp(40px,6vw,80px) 0 40px' }}>
        <div className="mk-container">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '48px', marginBottom: '48px' }}>
            <div>
              <div style={{ fontFamily: 'var(--mk-font-h)', fontSize: '1.4rem', fontWeight: 800, marginBottom: '12px' }}>
                OP<span style={{ color: 'var(--mk-teal)' }}>AI</span>
              </div>
              <p style={{ color: 'var(--mk-muted)', fontSize: '0.85rem', lineHeight: 1.7, maxWidth: '240px' }}>
                El único ERP diseñado exclusivamente para empresas de seguridad privada de Chile y LatAm.
              </p>
              <p style={{ color: 'var(--mk-muted)', fontSize: '0.8rem', marginTop: '16px', fontFamily: 'var(--mk-font-m)' }}>
                Desarrollado por <a href="https://lx3.ai" target="_blank" rel="noopener" style={{ color: 'var(--mk-teal)', textDecoration: 'none' }}>LX3.ai</a>
              </p>
            </div>
            <div>
              <h4 style={{ fontFamily: 'var(--mk-font-h)', fontSize: '0.85rem', fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--mk-muted)', marginBottom: '16px' }}>Producto</h4>
              {[
                { href: '/funcionalidades', label: 'Funcionalidades' },
                { href: '/funcionalidades/ia-operacional', label: 'IA Operacional' },
                { href: '/funcionalidades/portales', label: 'Portales' },
                { href: '/planes', label: 'Planes y precios' },
                { href: '/integraciones', label: 'Integraciones' },
              ].map(l => (
                <Link key={l.href} href={l.href} style={{ display: 'block', color: 'var(--mk-muted)', textDecoration: 'none', fontSize: '0.88rem', marginBottom: '10px', transition: 'color 0.2s' }}>
                  {l.label}
                </Link>
              ))}
            </div>
            <div>
              <h4 style={{ fontFamily: 'var(--mk-font-h)', fontSize: '0.85rem', fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--mk-muted)', marginBottom: '16px' }}>Soluciones</h4>
              {[
                { href: '/erp-seguridad-privada', label: 'ERP Seguridad Privada' },
                { href: '/control-rondas-gps', label: 'Control de Rondas GPS' },
                { href: '/funcionalidades/face-id', label: 'Face ID Biométrico' },
                { href: '/funcionalidades/alertas-cobertura', label: 'Alertas de Cobertura' },
                { href: '/ia-seguridad-privada', label: 'IA en Seguridad' },
              ].map(l => (
                <Link key={l.href} href={l.href} style={{ display: 'block', color: 'var(--mk-muted)', textDecoration: 'none', fontSize: '0.88rem', marginBottom: '10px', transition: 'color 0.2s' }}>
                  {l.label}
                </Link>
              ))}
            </div>
            <div>
              <h4 style={{ fontFamily: 'var(--mk-font-h)', fontSize: '0.85rem', fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--mk-muted)', marginBottom: '16px' }}>Recursos</h4>
              {[
                { href: '/blog', label: 'Blog' },
                { href: '/nosotros', label: 'Nosotros' },
                { href: '/registrarse', label: 'Comenzar gratis' },
                { href: '/contacto', label: 'Contacto' },
              ].map(l => (
                <Link key={l.href} href={l.href} style={{ display: 'block', color: 'var(--mk-muted)', textDecoration: 'none', fontSize: '0.88rem', marginBottom: '10px', transition: 'color 0.2s' }}>
                  {l.label}
                </Link>
              ))}
            </div>
          </div>
          <div style={{ borderTop: '1px solid var(--mk-border)', paddingTop: '24px', display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px', alignItems: 'center' }}>
            <p style={{ color: 'var(--mk-muted)', fontSize: '0.8rem', fontFamily: 'var(--mk-font-m)' }}>
              © {new Date().getFullYear()} OPAI — Todos los derechos reservados
            </p>
            <div style={{ display: 'flex', gap: '20px', alignItems: 'center', flexWrap: 'wrap' }}>
              <a
                href="https://www.linkedin.com/company/opai-ai"
                target="_blank"
                rel="noopener noreferrer"
                className="mk-footer-linkedin"
                aria-label="OPAI en LinkedIn"
              >
                <Linkedin size={22} strokeWidth={1.75} aria-hidden />
              </a>
              <Link href="/privacidad" style={{ color: 'var(--mk-muted)', fontSize: '0.8rem', textDecoration: 'none' }}>Privacidad</Link>
              <Link href="/terminos" style={{ color: 'var(--mk-muted)', fontSize: '0.8rem', textDecoration: 'none' }}>Términos</Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}
