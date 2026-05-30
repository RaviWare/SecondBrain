import type { Metadata, Viewport } from 'next'
import { Inter, JetBrains_Mono } from 'next/font/google'
import { ClerkProvider } from '@clerk/nextjs'
import { ThemeProvider, themeInitScript } from '@/components/theme/ThemeProvider'
import './globals.css'

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' })
const jetbrainsMono = JetBrains_Mono({ subsets: ['latin'], variable: '--font-mono' })
const siteUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  applicationName: 'SecondBrain Cloud',
  alternates: {
    canonical: '/',
  },
	  title: {
	    default: 'SecondBrain Cloud | Your Private AI Operating System',
	    template: '%s | SecondBrain Cloud',
	  },
	  description:
	    'SecondBrain Cloud is a private AI operating system: a knowledge vault that turns your sources into cited memory, plus a team of always-on AI agents that work it for you 24/7.',
  keywords: [
    'AI agent operating system',
    'autonomous AI agents',
    'AI second brain',
    'personal knowledge base',
    'AI memory app',
    '24/7 AI agent',
    'knowledge graph',
    'personal AI assistant',
    'AI note taking',
    'cited answers',
  ],
  category: 'technology',
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-image-preview': 'large',
      'max-snippet': -1,
      'max-video-preview': -1,
    },
  },
  openGraph: {
    type: 'website',
    url: siteUrl,
    siteName: 'SecondBrain Cloud',
    title: 'SecondBrain Cloud | Your Private AI Operating System',
	    description:
	      'A private AI workspace for cited recall, plus a team of always-on agents that work your knowledge 24/7.',
    images: [
      {
        url: '/icon.svg',
        width: 512,
        height: 512,
        alt: 'SecondBrain Cloud',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
	    title: 'SecondBrain Cloud | Your Private AI Operating System',
	    description:
	      'Turn what you know into cited memory, then let always-on AI agents work it for you 24/7.',
    images: ['/icon.svg'],
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#0a0a0b',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider>
      <html
        lang="en"
        className={`${inter.variable} ${jetbrainsMono.variable} h-full antialiased`}
        suppressHydrationWarning
      >
        <head>
          {/* Prevent theme flash — applies data-theme before paint */}
          <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
        </head>
        <body className="min-h-full">
          <ThemeProvider>{children}</ThemeProvider>
        </body>
      </html>
    </ClerkProvider>
  )
}
