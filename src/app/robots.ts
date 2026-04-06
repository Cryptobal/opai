import { MetadataRoute } from 'next'

const APP_DISALLOW = [
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
]

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: APP_DISALLOW,
      },
      {
        userAgent: 'GPTBot',
        allow: ['/', '/llms.txt', '/llms-full.txt'],
        disallow: APP_DISALLOW,
      },
      {
        userAgent: 'ChatGPT-User',
        allow: ['/', '/llms.txt', '/llms-full.txt'],
        disallow: APP_DISALLOW,
      },
      {
        userAgent: 'Google-Extended',
        allow: ['/', '/llms.txt', '/llms-full.txt'],
        disallow: APP_DISALLOW,
      },
      {
        userAgent: 'PerplexityBot',
        allow: ['/', '/llms.txt', '/llms-full.txt'],
        disallow: APP_DISALLOW,
      },
      {
        userAgent: 'ClaudeBot',
        allow: ['/', '/llms.txt', '/llms-full.txt'],
        disallow: APP_DISALLOW,
      },
      {
        userAgent: 'anthropic-ai',
        allow: ['/', '/llms.txt', '/llms-full.txt'],
        disallow: APP_DISALLOW,
      },
      {
        userAgent: 'CCBot',
        allow: ['/', '/llms.txt', '/llms-full.txt'],
        disallow: APP_DISALLOW,
      },
      {
        userAgent: 'Bytespider',
        allow: ['/', '/llms.txt', '/llms-full.txt'],
        disallow: APP_DISALLOW,
      },
      {
        userAgent: 'cohere-ai',
        allow: ['/', '/llms.txt', '/llms-full.txt'],
        disallow: APP_DISALLOW,
      },
    ],
    sitemap: [
      'https://www.opai.cl/sitemap.xml',
      'https://www.opai.cl/sitemap-empleos.xml',
    ],
  }
}
