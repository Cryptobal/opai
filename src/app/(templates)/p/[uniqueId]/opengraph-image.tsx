import { headers } from 'next/headers';
import { ImageResponse } from 'next/og';

export const size = {
  width: 1200,
  height: 630,
};

export const contentType = 'image/png';

export default async function OpenGraphImage() {
  const headersList = await headers();
  const host = headersList.get('x-forwarded-host') ?? headersList.get('host') ?? 'opai.gard.cl';
  const protocol = headersList.get('x-forwarded-proto') ?? 'https';
  const logoUrl = `${protocol}://${host}/logos/logo-escudo-azul.svg`;

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          background: '#f8fafc',
          padding: '64px',
          color: '#0f172a',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
          <img src={logoUrl} width="120" height="120" alt="Escudo Gard Security" />
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontSize: 34, fontWeight: 700 }}>Gard Security</span>
            <span style={{ fontSize: 24, color: '#334155' }}>Propuesta Comercial</span>
          </div>
        </div>
        <span style={{ marginTop: '28px', fontSize: 42, fontWeight: 700 }}>
          Seguridad privada con control y trazabilidad real
        </span>
      </div>
    ),
    {
      ...size,
    }
  );
}
