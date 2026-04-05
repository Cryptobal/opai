import { ImageResponse } from 'next/og'
import { getPostBySlug } from '@/lib/blog'

export const alt = 'OPAI Blog'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const post = getPostBySlug(slug)

  if (!post) {
    return new ImageResponse(
      (
        <div
          style={{
            width: '100%',
            height: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: '#060a13',
            color: '#ffffff',
            fontSize: 48,
            fontWeight: 900,
          }}
        >
          OPAI Blog
        </div>
      ),
      { ...size }
    )
  }

  const formattedDate = new Date(post.date).toLocaleDateString('es-CL', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          backgroundColor: '#060a13',
          padding: '60px',
          borderBottom: '4px solid #1d9e75',
        }}
      >
        {/* Category badge */}
        <div style={{ display: 'flex' }}>
          <div
            style={{
              backgroundColor: '#1d9e75',
              color: '#ffffff',
              fontSize: 14,
              textTransform: 'uppercase',
              padding: '6px 12px',
              borderRadius: 4,
              fontWeight: 700,
              letterSpacing: '0.05em',
            }}
          >
            {post.category}
          </div>
        </div>

        {/* Title */}
        <div
          style={{
            display: 'flex',
            fontSize: 48,
            fontWeight: 900,
            color: '#ffffff',
            lineHeight: 1.2,
            maxWidth: '80%',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {post.title}
        </div>

        {/* Bottom row: logo left, date right */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-end',
            width: '100%',
          }}
        >
          {/* Logo */}
          <div style={{ display: 'flex', fontSize: 22, fontWeight: 900 }}>
            <span style={{ color: '#ffffff' }}>OP</span>
            <span style={{ color: '#1d9e75' }}>AI</span>
          </div>

          {/* Date */}
          <div style={{ fontSize: 13, color: '#888780' }}>
            {formattedDate}
          </div>
        </div>
      </div>
    ),
    { ...size }
  )
}
