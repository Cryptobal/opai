import { MetadataRoute } from 'next'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: [
        '/opai/',
        '/portal/',
        '/api/',
        '/hub/',
        '/welcome',
        '/marcacion/',
        '/marcar/',
        '/ronda/',
        '/contrato/',
        '/postulacion/',
        '/activate/',
        '/ingreso-te/',
        '/personas/',
        '/platform/',
        '/descargar/',
        '/alerta/',
      ],
    },
    sitemap: 'https://www.opai.cl/sitemap.xml',
  }
}
