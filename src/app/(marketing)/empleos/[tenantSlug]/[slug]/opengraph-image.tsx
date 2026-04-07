import { ImageResponse } from 'next/og'
import { prisma } from '@/lib/prisma'
import { resolveTenantFromSlug } from '@/lib/tenant'
import { getTenantCompanyConfig } from '@/lib/tenant-config'

export const runtime = 'nodejs'
export const alt = 'Empleo | OPAI'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

function notFoundImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#050A12',
          color: '#fff',
          fontSize: 48,
          fontWeight: 900,
        }}
      >
        OPAI — Empleo no encontrado
      </div>
    ),
    { ...size }
  )
}

export default async function OgImage({
  params,
}: {
  params: Promise<{ tenantSlug: string; slug: string }>
}) {
  const { tenantSlug, slug } = await params
  const tenant = await resolveTenantFromSlug(tenantSlug)
  if (!tenant) return notFoundImage()

  const cfg = await getTenantCompanyConfig(tenant.id)
  const companyName = cfg.commercialName || cfg.companyName

  const job = await prisma.atsJobPosting.findFirst({
    where: { jsonLdSlug: slug, tenantId: tenant.id, estado: 'ACTIVO' },
    select: { titulo: true, region: true, commune: true, rentaMin: true, rentaMax: true },
  })

  if (!job) return notFoundImage()

  const location = [job.commune, job.region].filter(Boolean).join(', ')
  const salary = job.rentaMin
    ? `$${job.rentaMin.toLocaleString('es-CL')}${job.rentaMax ? ` - $${job.rentaMax.toLocaleString('es-CL')}` : '+'}`
    : null

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          background: '#050A12',
          padding: '60px',
          fontFamily: 'sans-serif',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div
            style={{
              background: '#00D4B020',
              color: '#00D4B0',
              fontSize: '14px',
              fontWeight: 700,
              padding: '6px 14px',
              borderRadius: '6px',
              display: 'flex',
              letterSpacing: '0.05em',
              textTransform: 'uppercase',
            }}
          >
            Empleo disponible
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div
            style={{
              display: 'flex',
              fontSize: '48px',
              fontWeight: 900,
              color: '#E8EDF5',
              lineHeight: 1.15,
              maxWidth: '90%',
            }}
          >
            {job.titulo}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <div style={{ display: 'flex', fontSize: '22px', color: '#657BA0', fontWeight: 600 }}>
              {companyName}
            </div>
            {location && (
              <>
                <div style={{ display: 'flex', color: '#657BA050', fontSize: '22px' }}>·</div>
                <div style={{ display: 'flex', fontSize: '22px', color: '#657BA0' }}>
                  {location}
                </div>
              </>
            )}
          </div>
          {salary && (
            <div style={{ display: 'flex', fontSize: '24px', color: '#00D4B0', fontWeight: 700 }}>
              {salary} /mes
            </div>
          )}
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
          <div style={{ display: 'flex', fontSize: '22px', fontWeight: 900 }}>
            <span style={{ color: '#E8EDF5' }}>OP</span>
            <span style={{ color: '#00D4B0' }}>AI</span>
          </div>
          <div style={{ fontSize: '13px', color: '#657BA080' }}>
            opai.cl/empleos
          </div>
        </div>
      </div>
    ),
    { ...size }
  )
}
