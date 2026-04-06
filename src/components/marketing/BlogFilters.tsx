'use client'

import { useState } from 'react'
import Link from 'next/link'

interface BlogPost {
  slug: string
  title: string
  description: string
  category: string
  readingTime: string
  date: string
  author: string
  featured?: boolean
}

export function BlogFilters({
  posts,
  categories,
}: {
  posts: BlogPost[]
  categories: string[]
}) {
  const [activeCategory, setActiveCategory] = useState<string | null>(null)

  const featured = posts.find((p) => p.featured)
  const filtered = activeCategory
    ? posts.filter((p) => p.category === activeCategory && p !== featured)
    : posts.filter((p) => p !== featured)

  return (
    <>
      {/* Categories */}
      <section style={{ paddingBottom: '40px' }}>
        <div className="mk-container">
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <button
              onClick={() => setActiveCategory(null)}
              style={{
                fontFamily: 'var(--mk-font-m)',
                fontSize: '11px',
                padding: '6px 14px',
                background: !activeCategory ? 'var(--mk-teal-dim)' : 'var(--mk-bg-card)',
                border: `1px solid ${!activeCategory ? 'var(--mk-teal-glow)' : 'var(--mk-border)'}`,
                color: !activeCategory ? 'var(--mk-teal)' : 'var(--mk-muted)',
                borderRadius: '2px',
                cursor: 'pointer',
                transition: 'all 0.2s',
              }}
            >
              Todos
            </button>
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setActiveCategory(cat)}
                style={{
                  fontFamily: 'var(--mk-font-m)',
                  fontSize: '11px',
                  padding: '6px 14px',
                  background: activeCategory === cat ? 'var(--mk-teal-dim)' : 'var(--mk-bg-card)',
                  border: `1px solid ${activeCategory === cat ? 'var(--mk-teal-glow)' : 'var(--mk-border)'}`,
                  color: activeCategory === cat ? 'var(--mk-teal)' : 'var(--mk-muted)',
                  borderRadius: '2px',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                }}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Featured post */}
      {featured && !activeCategory && (
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
          {filtered.length === 0 ? (
            <p style={{ color: 'var(--mk-muted)', textAlign: 'center', padding: '60px 0' }}>
              {activeCategory
                ? `No hay artículos en la categoría "${activeCategory}" aún. ¡Vuelve pronto!`
                : 'Próximamente publicaremos contenido. ¡Vuelve pronto!'}
            </p>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '16px' }}>
              {filtered.map((post) => (
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
    </>
  )
}
