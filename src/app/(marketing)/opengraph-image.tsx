import { ImageResponse } from 'next/og'

export const runtime = 'edge'
export const alt = 'OPAI — ERP con IA para Seguridad Privada'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default async function OgImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#050A12',
          position: 'relative',
          fontFamily: 'sans-serif',
        }}
      >
        {/* Grid pattern */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            backgroundImage:
              'linear-gradient(rgba(0,212,176,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(0,212,176,0.04) 1px, transparent 1px)',
            backgroundSize: '48px 48px',
          }}
        />

        {/* Glow */}
        <div
          style={{
            position: 'absolute',
            top: '-100px',
            left: '50%',
            transform: 'translateX(-50%)',
            width: '600px',
            height: '400px',
            background:
              'radial-gradient(ellipse, rgba(0,212,176,0.12) 0%, transparent 70%)',
            display: 'flex',
          }}
        />

        {/* Logo */}
        <div
          style={{
            display: 'flex',
            fontSize: '96px',
            fontWeight: 800,
            letterSpacing: '-0.03em',
            color: '#E8EDF5',
          }}
        >
          OP
          <span style={{ color: '#00D4B0' }}>AI</span>
        </div>

        {/* Divider */}
        <div
          style={{
            width: '80px',
            height: '3px',
            background: '#00D4B0',
            marginTop: '24px',
            marginBottom: '24px',
            display: 'flex',
          }}
        />

        {/* Subtitle */}
        <div
          style={{
            display: 'flex',
            fontSize: '28px',
            fontWeight: 600,
            color: '#657BA0',
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
          }}
        >
          ERP con IA para Seguridad Privada
        </div>

        {/* Bottom stats */}
        <div
          style={{
            position: 'absolute',
            bottom: '48px',
            display: 'flex',
            gap: '48px',
          }}
        >
          {[
            { v: '259', l: 'Modelos' },
            { v: '801', l: 'Endpoints' },
            { v: '6', l: 'Portales' },
            { v: '18', l: 'Automatizaciones' },
          ].map((s) => (
            <div
              key={s.l}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
              }}
            >
              <div
                style={{
                  fontSize: '32px',
                  fontWeight: 800,
                  color: '#00D4B0',
                  display: 'flex',
                }}
              >
                {s.v}
              </div>
              <div
                style={{
                  fontSize: '12px',
                  color: '#657BA0',
                  letterSpacing: '0.1em',
                  textTransform: 'uppercase',
                  marginTop: '4px',
                  display: 'flex',
                }}
              >
                {s.l}
              </div>
            </div>
          ))}
        </div>
      </div>
    ),
    { ...size }
  )
}
