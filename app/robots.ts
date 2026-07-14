import { MetadataRoute } from 'next'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/dashboard/', '/room/', '/meetings/', '/calendars/manage/'],
    },
    sitemap: 'https://tsmeet.tanvirsoft.com/sitemap.xml',
  }
}
