import React from "react"
import type { Metadata, Viewport } from 'next'
import './globals.css'
import { APP_NAME, APP_TAGLINE } from '@/lib/appConfig'

export const metadata: Metadata = {
  applicationName: APP_NAME,
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, title: APP_NAME, statusBarStyle: 'default' },
  title: {
    default: `${APP_NAME} - ${APP_TAGLINE}`,
    template: `%s | ${APP_NAME}`
  },
  description: `${APP_NAME} is an open-source video conferencing platform for private group calls, screen sharing, recording, and calendar scheduling.`,
  keywords: ['video chat', 'open-source video meetings', 'secure group calls', 'screen sharing', 'webRTC', 'calendar scheduling'],
  authors: [{ name: 'Tanvir Ahmmed', url: 'https://tanvirsoft.com/' }],
  creator: 'Tanvir Ahmmed',
  publisher: 'TanvirSoft',
  metadataBase: new URL('https://tsmeet.tanvirsoft.com'),
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: 'https://tsmeet.tanvirsoft.com',
    title: `${APP_NAME} - ${APP_TAGLINE}`,
    description: `${APP_NAME} is an open-source video conferencing platform for private group calls, screen sharing, recording, and calendar scheduling.`,
    siteName: APP_NAME,
    images: [{
      url: '/og-image.png',
      width: 1200,
      height: 630,
      alt: `${APP_NAME} — self-hosted video meetings.`,
    }],
  },
  twitter: {
    card: 'summary_large_image',
    title: `${APP_NAME} - ${APP_TAGLINE}`,
    description: `${APP_NAME} is an open-source video conferencing platform for private group calls.`,
    images: ['/og-image.png'],
  },
  icons: {
    icon: [
      { url: '/favicon.ico?v=tsmeet-1', sizes: '16x16 32x32 48x48' },
      { url: '/favicon-32x32.png?v=tsmeet-1', type: 'image/png', sizes: '32x32' },
      { url: '/icon.svg?v=tsmeet-1', type: 'image/svg+xml', sizes: 'any' },
    ],
    shortcut: '/favicon.ico?v=tsmeet-1',
    apple: [{ url: '/apple-icon.png?v=tsmeet-1', sizes: '180x180', type: 'image/png' }],
  },
}

export const viewport: Viewport = { themeColor: '#00877b' }

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <body className={`font-sans antialiased`}>
        {children}
      </body>
    </html>
  )
}
