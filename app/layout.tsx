import React from "react"
import type { Metadata, Viewport } from 'next'
import './globals.css'

export const metadata: Metadata = {
  applicationName: 'TSMeet',
  manifest: '/site.webmanifest',
  appleWebApp: { capable: true, title: 'TSMeet', statusBarStyle: 'default' },
  title: {
    default: 'TSMeet - Secure Open-Source Video Meetings',
    template: '%s | TSMeet'
  },
  description: 'TSMeet is the best open-source video conferencing platform for private, zero-latency group calls, screen sharing, recording, and calendar scheduling.',
  keywords: ['video chat', 'open-source video meetings', 'secure group calls', 'screen sharing', 'webRTC', 'calendar scheduling'],
  authors: [{ name: 'Tanvir Ahmmed', url: 'https://tanvirsoft.com/' }],
  creator: 'Tanvir Ahmmed',
  publisher: 'TanvirSoft',
  metadataBase: new URL('https://tsmeet.tanvirsoft.com'),
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: 'https://tsmeet.tanvirsoft.com',
    title: 'TSMeet - Secure Open-Source Video Meetings',
    description: 'TSMeet is the best open-source video conferencing platform for private, zero-latency group calls, screen sharing, recording, and calendar scheduling.',
    siteName: 'TSMeet',
    images: [{
      url: '/og-image.png',
      width: 1200,
      height: 630,
      alt: 'TSMeet — Meet. Share. Connect. Self-hosted video meetings.',
    }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'TSMeet - Secure Open-Source Video Meetings',
    description: 'TSMeet is the best open-source video conferencing platform for private, zero-latency group calls.',
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
