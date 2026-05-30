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
	    default: 'SecondBrain Cloud | Private AI Memory Workspace',
	    template: '%s | SecondBrain Cloud',
	  },
	  description:
	    'SecondBrain Cloud captures sources, notes, files, and decisions in a private AI memory workspace with cited search and graph context.',
  keywords: [
    'AI second brain',
    'personal knowledge base',
    'AI memory app',
    'AI knowledge base',
    'knowledge management software',
    'knowledge graph',
    'personal search engine',
    'AI note taking',
    'cited answers',
    'research knowledge management',
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
	    title: 'SecondBrain Cloud | Private AI Memory Workspace',
	    description:
	      'A private AI workspace for source-backed recall, cited answers, and connected knowledge.',
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
	    title: 'SecondBrain Cloud | Private AI Memory Workspace',
	    description:
	      'Capture sources, organize memory, and search your own knowledge with citations.',
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
