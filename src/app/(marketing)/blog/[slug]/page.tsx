import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { MDXRemote } from 'next-mdx-remote/rsc'
import { getAllPosts, getPostBySlug } from '@/lib/blog'
import { TrialBanner } from '@/components/marketing/TrialBanner'

interface Props {
  params: Promise<{ slug: string }>
}

export async function generateStaticParams() {
  const posts = getAllPosts()
  return posts.map(post => ({ slug: post.slug }))
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const post = getPostBySlug(slug)
  if (!post) return {}
  return {
    title: `${post.title} | Blog OPAI`,
    description: post.description,
    alternates: { canonical: `https://www.opai.cl/blog/${post.slug}` },
    openGraph: {
      title: post.title,
      description: post.description,
      type: 'article',
      publishedTime: post.date,
      authors: [post.author],
      url: `https://www.opai.cl/blog/${post.slug}`,
      images: [{
        url: `/blog/${post.slug}/opengraph-image`,
        width: 1200,
        height: 630,
        alt: post.title,
      }],
    },
  }
}

export default async function BlogPostPage({ params }: Props) {
  const { slug } = await params
  const post = getPostBySlug(slug)
  if (!post) notFound()

  const allPosts = getAllPosts()
  const related = allPosts
    .filter(p => p.slug !== post.slug && p.category === post.category)
    .slice(0, 3)

  const articleJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: post.title,
    description: post.description,
    datePublished: post.date,
    author: { '@type': 'Person', name: post.author },
    publisher: { '@type': 'Organization', name: 'OPAI', url: 'https://www.opai.cl' },
    url: `https://www.opai.cl/blog/${post.slug}`,
    image: `https://www.opai.cl/blog/${post.slug}/opengraph-image`,
  }

  const breadcrumbJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Inicio', item: 'https://www.opai.cl' },
      { '@type': 'ListItem', position: 2, name: 'Blog', item: 'https://www.opai.cl/blog' },
      { '@type': 'ListItem', position: 3, name: post.title, item: `https://www.opai.cl/blog/${post.slug}` },
    ],
  }

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(articleJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }} />

      <article style={{ padding: 'clamp(80px,12vw,140px) 0 0' }}>
        <div className="mk-container" style={{ maxWidth: '820px' }}>
          {/* Breadcrumb */}
          <nav style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '32px', flexWrap: 'wrap' }}>
            <Link href="/" style={{ color: 'var(--mk-muted)', textDecoration: 'none', fontSize: '0.8rem' }}>Inicio</Link>
            <span style={{ color: 'var(--mk-muted)', fontSize: '0.8rem' }}>›</span>
            <Link href="/blog" style={{ color: 'var(--mk-muted)', textDecoration: 'none', fontSize: '0.8rem' }}>Blog</Link>
            <span style={{ color: 'var(--mk-muted)', fontSize: '0.8rem' }}>›</span>
            <span style={{ color: 'var(--mk-teal)', fontSize: '0.8rem' }}>{post.category}</span>
          </nav>

          {/* Header */}
          <div style={{ marginBottom: '48px' }}>
            <span style={{
              fontFamily: 'var(--mk-font-m)', fontSize: '10px', textTransform: 'uppercase',
              letterSpacing: '0.12em', color: 'var(--mk-teal)', background: 'var(--mk-teal-dim)',
              border: '1px solid var(--mk-teal-glow)', padding: '3px 8px', borderRadius: '2px',
              display: 'inline-block', marginBottom: '18px',
            }}>
              {post.category}
            </span>
            <h1 style={{
              fontFamily: 'var(--mk-font-h)',
              fontSize: 'clamp(1.8rem,4vw,2.8rem)',
              fontWeight: 900,
              color: 'var(--mk-text)',
              lineHeight: 1.15,
              marginBottom: '18px',
            }}>
              {post.title}
            </h1>
            <div style={{ display: 'flex', gap: '16px', alignItems: 'center', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '0.85rem', color: 'var(--mk-muted)' }}>{post.author}</span>
              <span style={{ fontSize: '0.85rem', color: 'var(--mk-muted)' }}>·</span>
              <span style={{ fontSize: '0.85rem', color: 'var(--mk-muted)', fontFamily: 'var(--mk-font-m)' }}>{post.date}</span>
              <span style={{ fontSize: '0.85rem', color: 'var(--mk-muted)' }}>·</span>
              <span style={{ fontSize: '0.85rem', color: 'var(--mk-muted)', fontFamily: 'var(--mk-font-m)' }}>{post.readingTime}</span>
            </div>
          </div>

          {/* Content */}
          <div className="mk-prose" style={{ marginBottom: '64px' }}>
            <MDXRemote source={post.content} />
          </div>

          {/* Tags */}
          {post.tags.length > 0 && (
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '48px', paddingTop: '24px', borderTop: '1px solid var(--mk-border)' }}>
              {post.tags.map(tag => (
                <span key={tag} style={{
                  fontFamily: 'var(--mk-font-m)', fontSize: '10px', padding: '4px 10px',
                  background: 'var(--mk-bg-card)', border: '1px solid var(--mk-border)',
                  color: 'var(--mk-muted)', borderRadius: '2px',
                }}>
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>
      </article>

      {/* Related posts */}
      {related.length > 0 && (
        <section className="mk-section" style={{ borderTop: '1px solid var(--mk-border)' }}>
          <div className="mk-container" style={{ maxWidth: '820px' }}>
            <h2 style={{ fontFamily: 'var(--mk-font-h)', fontSize: '1.4rem', fontWeight: 800, color: 'var(--mk-text)', marginBottom: '28px' }}>
              Artículos relacionados
            </h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '14px' }}>
              {related.map(r => (
                <Link key={r.slug} href={`/blog/${r.slug}`} style={{ textDecoration: 'none' }}>
                  <div className="mk-card" style={{ padding: '20px' }}>
                    <span style={{ fontFamily: 'var(--mk-font-m)', fontSize: '10px', color: 'var(--mk-teal)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                      {r.category}
                    </span>
                    <h3 style={{ fontFamily: 'var(--mk-font-h)', fontSize: '0.95rem', fontWeight: 700, color: 'var(--mk-text)', marginTop: '8px', lineHeight: 1.35 }}>
                      {r.title}
                    </h3>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

      <TrialBanner />
    </>
  )
}
