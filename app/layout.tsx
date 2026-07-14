import React from "react"
import type { Metadata } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import './globals.css'

const _geist = Geist({ subsets: ["latin"] });
const _geistMono = Geist_Mono({ subsets: ["latin"] });

export const metadata: Metadata = {
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
      url: '/og-image.jpg',
      width: 1200,
      height: 630,
      alt: 'TSMeet Video Conferencing Dashboard',
    }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'TSMeet - Secure Open-Source Video Meetings',
    description: 'TSMeet is the best open-source video conferencing platform for private, zero-latency group calls.',
    images: ['/og-image.jpg'],
  },
  generator: 'v0.app',
  icons: {
    icon: [
      {
        url: '/icon-light-32x32.png',
        media: '(prefers-color-scheme: light)',
      },
      {
        url: '/icon-dark-32x32.png',
        media: '(prefers-color-scheme: dark)',
      },
      {
        url: '/icon.svg',
        type: 'image/svg+xml',
      },
    ],
    apple: '/apple-icon.png',
  },
}

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
