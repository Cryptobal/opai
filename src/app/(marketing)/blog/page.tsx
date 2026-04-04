import type { Metadata } from 'next'
import Link from 'next/link'
import { getAllPosts, BLOG_CATEGORIES } from '@/lib/blog'
import { TrialBanner } from '@/components/marketing/TrialBanner'

export const metadata: Metadata = {
  title: 'Blog — Recursos para Empresas de Seguridad Privada',
  description:
    'Artículos sobre gestión de guardias, IA en seguridad privada, compliance laboral, control de rondas GPS y tecnología para empresas de seguridad en Chile.',
  alternates: { canonical: 'https://www.opai.cl/blog' },
  openGraph: {
    title: 'Blog | OPAI',
    description: 'Recursos y guías para empresas de seguridad privada.',
    url: 'https://www.opai.cl/blog',
  },
}

export default function BlogPage() {
  const posts = getAllPosts()
  const featured = posts.find(p => p.featured)
  const rest = posts.filter(p => p !== featured)

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

      {/* Categories */}
      <section style={{ paddingBottom: '40px' }}>
        <div className="mk-container">
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <span style={{
              fontFamily: 'var(--mk-font-m)', fontSize: '11px', padding: '6px 14px',
              background: 'var(--mk-teal-dim)', border: '1px solid var(--mk-teal-glow)',
              color: 'var(--mk-teal)', borderRadius: '2px', cursor: 'pointer',
            }}>
              Todos
            </span>
            {BLOG_CATEGORIES.map(cat => (
              <span key={cat} style={{
                fontFamily: 'var(--mk-font-m)', fontSize: '11px', padding: '6px 14px',
                background: 'var(--mk-bg-card)', border: '1px solid var(--mk-border)',
                color: 'var(--mk-muted)', borderRadius: '2px', cursor: 'pointer',
              }}>
                {cat}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* Featured post */}
      {featured && (
        <section style={{ paddingBottom: '48px' }}>
          <div className="mk-container">
            <Link href={`/blog/${featured.slug}`} style={{ textDecoration: 'none', display: 'block' }}>
              <div className="mk-card" style={{ padding: 'clamp(28px,5vw,48px)', position: 'relative', overflow: 'hidden' }}>
                <div style={{ position: 'absolute', top: 0, left: 0, right: '70%', height: '3px', background: 'var(--mk-teal)' }} />
                <div style={{ display: 'flex', gap: '12px', alignItems: 'center', marginBottom: '18px', flexWrap: 'wrap' }}>
                  <span style={{ fontFamily: 'var(--mk-font-m)', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--mk-teal)', background: 'var(--mk-teal-dim)', border: '1px solid var(--mk-teal-glow)', padding: '3px 8px', borderRadius: '2px' }}>
                    Destacado
                  </span>
                  <span style={{ fontFamily: 'var(--mk-font-m)', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--mk-muted)' }}>
                    {featured.category}
                  </span>
                  <span style={{ fontFamily: 'var(--mk-font-m)', fontSize: '10px', color: 'var(--mk-muted)' }}>
                    {featured.readingTime}
                  </span>
                </div>
                <h2 style={{ fontFamily: 'var(--mk-font-h)', fontSize: 'clamp(1.4rem,3vw,2rem)', fontWeight: 800, color: 'var(--mk-text)', marginBottom: '12px', maxWidth: '680px' }}>
                  {featured.title}
                </h2>
                <p style={{ color: 'var(--mk-muted)', fontSize: '0.95rem', lineHeight: 1.7, maxWidth: '600px' }}>
                  {featured.description}
                </p>
                <span style={{ display: 'inline-block', marginTop: '18px', fontFamily: 'var(--mk-font-h)', fontSize: '0.88rem', fontWeight: 600, color: 'var(--mk-teal)' }}>
                  Leer artículo →
                </span>
              </div>
            </Link>
          </div>
        </section>
      )}

      {/* Posts grid */}
      <section className="mk-section" style={{ paddingTop: 0 }}>
        <div className="mk-container">
          {rest.length === 0 && !featured ? (
            <p style={{ color: 'var(--mk-muted)', textAlign: 'center', padding: '60px 0' }}>
              Próximamente publicaremos contenido. ¡Vuelve pronto!
            </p>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '16px' }}>
              {rest.map(post => (
                <Link key={post.slug} href={`/blog/${post.slug}`} style={{ textDecoration: 'none' }}>
                  <article className="mk-card" style={{ padding: 'clamp(20px,3vw,28px)', height: '100%', display: 'flex', flexDirection: 'column' }}>
                    <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '14px' }}>
                      <span style={{ fontFamily: 'var(--mk-font-m)', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--mk-teal)' }}>
                        {post.category}
                      </span>
                      <span style={{ fontFamily: 'var(--mk-font-m)', fontSize: '10px', color: 'var(--mk-muted)' }}>
                        {post.readingTime}
                      </span>
                    </div>
                    <h3 style={{ fontFamily: 'var(--mk-font-h)', fontSize: '1.05rem', fontWeight: 700, color: 'var(--mk-text)', marginBottom: '10px', lineHeight: 1.35 }}>
                      {post.title}
                    </h3>
                    <p style={{ color: 'var(--mk-muted)', fontSize: '0.85rem', lineHeight: 1.65, flex: 1 }}>
                      {post.description}
                    </p>
                    <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginTop: '16px', paddingTop: '14px', borderTop: '1px solid var(--mk-border)' }}>
                      <span style={{ fontSize: '0.78rem', color: 'var(--mk-muted)', fontFamily: 'var(--mk-font-m)' }}>
                        {post.date}
                      </span>
                      <span style={{ fontSize: '0.78rem', color: 'var(--mk-muted)' }}>·</span>
                      <span style={{ fontSize: '0.78rem', color: 'var(--mk-muted)' }}>
                        {post.author}
                      </span>
                    </div>
                  </article>
                </Link>
              ))}
            </div>
          )}
        </div>
      </section>

      <TrialBanner />
    </>
  )
}
