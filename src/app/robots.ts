import { MetadataRoute } from 'next'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: '*', allow: '/', disallow: ['/opai/', '/portal/', '/api/', '/hub/'] },
    sitemap: 'https://www.opai.cl/sitemap.xml',
  }
}
