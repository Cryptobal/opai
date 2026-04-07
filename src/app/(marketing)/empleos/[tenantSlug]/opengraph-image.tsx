import { ImageResponse } from 'next/og'
import { resolveTenantFromSlug } from '@/lib/tenant'
import { getTenantCompanyConfig } from '@/lib/tenant-config'

export const runtime = 'nodejs'
export const alt = 'Empleos | OPAI'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default async function OgImage({ params }: { params: Promise<{ tenantSlug: string }> }) {
  const { tenantSlug } = await params
  const tenant = await resolveTenantFromSlug(tenantSlug)
  let companyName = tenantSlug
  if (tenant) {
    const cfg = await getTenantCompanyConfig(tenant.id)
    companyName = cfg.commercialName || cfg.companyName || tenantSlug
  }

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
        <div style={{ display: 'flex', fontSize: '64px', fontWeight: 800, color: '#E8EDF5' }}>
          OP<span style={{ color: '#00D4B0' }}>AI</span>
        </div>
        <div
          style={{
            width: '60px',
            height: '3px',
            background: '#00D4B0',
            marginTop: '16px',
            marginBottom: '16px',
            display: 'flex',
          }}
        />
        <div
          style={{
            display: 'flex',
            fontSize: '28px',
            fontWeight: 700,
            color: '#E8EDF5',
            marginBottom: '8px',
          }}
        >
          Empleos en {companyName}
        </div>
        <div
          style={{
            display: 'flex',
            fontSize: '16px',
            color: '#657BA0',
          }}
        >
          Ofertas de trabajo para guardias de seguridad
        </div>
      </div>
    ),
    { ...size }
  )
}
