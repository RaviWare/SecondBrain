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
    default: 'SecondBrain Cloud | AI Second Brain and Personal Knowledge Base',
    template: '%s | SecondBrain Cloud',
  },
  description:
    'SecondBrain Cloud is AI second brain software that turns notes, PDFs, URLs, and transcripts into a private knowledge base with cited answers, living memory, and graph search.',
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
    title: 'SecondBrain Cloud | AI Second Brain and Personal Knowledge Base',
    description:
      'Turn sources into a maintained, searchable, cited second brain with memory pages, graph navigation, and evidence-backed answers.',
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
    title: 'SecondBrain Cloud | AI Second Brain and Personal Knowledge Base',
    description:
      'Ingest anything. Build a private AI knowledge base. Query your own memory with citations and graph context.',
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
