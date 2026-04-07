import type { Metadata } from 'next'
import { getAllPosts, BLOG_CATEGORIES } from '@/lib/blog'
import { TrialBanner } from '@/components/marketing/TrialBanner'
import { BlogFilters } from '@/components/marketing/BlogFilters'

export const metadata: Metadata = {
  title: 'Blog — Recursos para Empresas de Seguridad Privada',
  description:
    'Artículos sobre gestión de guardias, IA en seguridad privada, compliance laboral, control de rondas GPS y tecnología para empresas de seguridad en Chile.',
  alternates: { canonical: 'https://www.opai.cl/blog' },
  openGraph: {
    title: 'Blog | OPAI',
    description: 'Recursos y guías para empresas de seguridad privada.',
    url: 'https://www.opai.cl/blog',
    type: 'website',
    images: [{ url: '/icons/og-image.png', width: 1200, height: 630, alt: 'OPAI — ERP con IA para Seguridad Privada' }],
  },
}

export default function BlogPage() {
  const posts = getAllPosts()

  return (
    <>
      {/* Hero */}
      <section style={{ padding: 'clamp(80px,12vw,140px) 0 clamp(40px,6vw,60px)' }}>
        <div className="mk-container">
          <div className="mk-label">
            <div className="mk-pulse" />
            Blog OPAI
          </div>
          <h1 style={{
            fontFamily: 'var(--mk-font-h)',
            fontSize: 'clamp(2rem,5vw,3.2rem)',
            fontWeight: 900,
            color: 'var(--mk-text)',
            maxWidth: '640px',
            marginBottom: '16px',
          }}>
            Recursos para empresas de seguridad privada
          </h1>
          <p style={{ color: 'var(--mk-muted)', fontSize: '1.05rem', maxWidth: '520px', lineHeight: 1.7 }}>
            Guías, tutoriales y análisis sobre gestión de guardias, tecnología, compliance y operaciones en seguridad privada.
          </p>
        </div>
      </section>

      <BlogFilters posts={posts} categories={BLOG_CATEGORIES} />

      <TrialBanner />
    </>
  )
}
