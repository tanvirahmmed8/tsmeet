import type { MetadataRoute } from 'next';
import { APP_NAME } from '@/lib/appConfig';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${APP_NAME} — Video Meetings`,
    short_name: APP_NAME,
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#091b22',
    theme_color: '#00877b',
    description: `${APP_NAME} self-hosted video meetings and scheduling.`,
    icons: [
      { src: '/app-icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/app-icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/app-icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
