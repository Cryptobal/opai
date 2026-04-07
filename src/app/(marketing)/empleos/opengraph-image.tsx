import { ImageResponse } from 'next/og'

export const runtime = 'edge'
export const alt = 'Empleos en Seguridad Privada | OPAI'
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
          fontFamily: 'sans-serif',
        }}
      >
        <div style={{ display: 'flex', fontSize: '72px', fontWeight: 800, color: '#E8EDF5' }}>
          OP<span style={{ color: '#00D4B0' }}>AI</span>
        </div>
        <div
          style={{
            width: '60px',
            height: '3px',
            background: '#00D4B0',
            marginTop: '20px',
            marginBottom: '20px',
            display: 'flex',
          }}
        />
        <div
          style={{
            display: 'flex',
            fontSize: '32px',
            fontWeight: 700,
            color: '#E8EDF5',
            marginBottom: '8px',
          }}
        >
          Empleos en Seguridad Privada
        </div>
        <div
          style={{
            display: 'flex',
            fontSize: '18px',
            color: '#657BA0',
          }}
        >
          Encuentra tu próximo empleo como guardia de seguridad en Chile
        </div>
      </div>
    ),
    { ...size }
  )
}
