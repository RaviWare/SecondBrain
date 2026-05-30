'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowRight, Brain, ChevronDown, FileUp, Link2, Mic, NotebookPen, Plus, Sparkles } from 'lucide-react'
import { suggestedQuestions } from '@/lib/dashboard-data'

const addOptions = [
  { label: 'Add note', href: '/app/ingest?type=note', icon: NotebookPen },
  { label: 'Upload PDF', href: '/app/ingest?type=file', icon: FileUp },
  { label: 'Save link', href: '/app/ingest?type=url', icon: Link2 },
  { label: 'Import transcript', href: '/app/ingest?type=transcript', icon: Mic },
]

export function TopActions() {
  const [open, setOpen] = useState(false)

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(value => !value)}
        className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-[linear-gradient(135deg,var(--dash-accent),#ff8a3d)] px-5 text-sm font-semibold text-white shadow-[0_18px_40px_rgba(255,102,0,0.24)] transition hover:-translate-y-0.5"
      >
        <Plus className="h-4 w-4" />
        Add
        <ChevronDown className="h-4 w-4" />
      </button>

      {open && (
        <div className="absolute right-0 top-14 z-20 w-52 overflow-hidden rounded-2xl border border-[var(--dash-border)] bg-[var(--dash-card)] p-2 shadow-[var(--dash-shadow-lg)]">
          {addOptions.map(({ label, href, icon: Icon }) => (
            <Link
              key={label}
              href={href}
              className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm text-[var(--dash-text)] transition hover:bg-[var(--dash-soft)]"
            >
              <Icon className="h-4 w-4 text-[var(--dash-accent)]" />
              {label}
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}

export function AskKnowledgeCard() {
  const [question, setQuestion] = useState('')
  const router = useRouter()

  const ask = () => {
    const q = question.trim()
    router.push(q ? `/app/query?q=${encodeURIComponent(q)}` : '/app/query')
  }

  return (
    <section className="relative overflow-hidden rounded-2xl border bg-[var(--dash-card)] p-6 shadow-[var(--dash-shadow-sm)]" style={{ borderColor: 'color-mix(in srgb, var(--dash-accent-2) 22%, var(--dash-border))' }}>
      <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(255,255,255,0.1),rgba(255,102,0,0.055),rgba(255,145,70,0.05))]" />
      <div className="absolute right-0 top-0 hidden h-full w-[38%] bg-[radial-gradient(circle_at_45%_50%,rgba(255,102,0,0.12),transparent_42%)] lg:block" />

      <div className="relative grid gap-6 lg:grid-cols-[minmax(0,1fr)_280px] lg:items-center 2xl:grid-cols-[minmax(0,1fr)_300px]">
        <div>
          <h2 className="text-xl font-semibold tracking-tight text-[var(--dash-text)]">
            Ask anything from your knowledge
          </h2>
          <p className="mt-1 text-sm text-[var(--dash-muted)]">
            Get answers from your sources with citations.
          </p>

          <form
            onSubmit={event => {
              event.preventDefault()
              ask()
            }}
            className="mt-6 flex max-w-3xl overflow-hidden rounded-xl border bg-[color-mix(in_srgb,var(--dash-card)_88%,white)] p-2 shadow-[0_10px_28px_rgba(255,102,0,0.08)]"
            style={{ borderColor: 'color-mix(in srgb, var(--dash-accent-2) 20%, var(--dash-border))' }}
          >
            <input
              value={question}
              onChange={event => setQuestion(event.target.value)}
              placeholder="Ask a question about your notes, docs, research, decisions..."
              className="min-w-0 flex-1 bg-transparent px-3 text-sm text-[var(--dash-text)] outline-none placeholder:text-[var(--dash-subtle)]"
            />
            <button
              type="submit"
              aria-label="Ask question"
              className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[linear-gradient(135deg,var(--dash-accent),#ff8a3d)] text-white shadow-[0_12px_28px_rgba(255,102,0,0.22)]"
            >
              <ArrowRight className="h-4 w-4" />
            </button>
          </form>

          <p className="mt-6 text-xs font-medium text-[var(--dash-muted)]">Try asking:</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {suggestedQuestions.map(prompt => (
              <button
                key={prompt}
                type="button"
                onClick={() => setQuestion(prompt)}
                className="inline-flex items-center gap-2 rounded-full border bg-[var(--dash-card)] px-3 py-1.5 text-xs font-medium text-[var(--dash-accent-2)] shadow-sm transition hover:-translate-y-0.5"
                style={{ borderColor: 'color-mix(in srgb, var(--dash-accent-2) 24%, var(--dash-border))' }}
              >
                <Sparkles className="h-3.5 w-3.5" />
                {prompt}
              </button>
            ))}
          </div>
        </div>

        <div className="hidden lg:block">
          <BrainNetworkIllustration />
        </div>
      </div>
    </section>
  )
}

function BrainNetworkIllustration() {
  return (
    <div className="relative mx-auto grid h-60 w-72 place-items-center">
      <div className="absolute left-1/2 top-1/2 z-10 grid h-24 w-32 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-[36px] border-[3px] bg-[var(--dash-soft)] text-[var(--dash-accent)] shadow-[0_22px_60px_rgba(255,102,0,0.22)]" style={{ borderColor: 'var(--dash-accent)' }}>
        <Brain className="h-12 w-12" />
      </div>
      <svg viewBox="0 0 280 230" className="h-full w-full" role="img" aria-label="Connected AI memory illustration">
        <g fill="none" stroke="color-mix(in srgb, var(--dash-accent) 24%, transparent)" strokeWidth="1.4">
          <path d="M137 116 58 72" />
          <path d="M137 116 65 165" />
          <path d="M137 116 142 38" />
          <path d="M137 116 220 63" />
          <path d="M137 116 224 160" />
          <path d="M137 116 140 196" />
        </g>
        {[
          [58, 72, 'M46 54h24v34H46z'],
          [65, 165, 'M53 147h24v34H53z'],
          [142, 38, 'M130 20h24v34h-24z'],
          [220, 63, 'M208 45h24v34h-24z'],
          [224, 160, 'M212 142h24v34h-24z'],
          [140, 196, 'M128 178h24v34h-24z'],
        ].map(([x, y, path], index) => (
          <g key={index}>
            <rect x={Number(x) - 18} y={Number(y) - 18} width="36" height="36" rx="10" fill="color-mix(in srgb, var(--dash-accent) 8%, white)" stroke="color-mix(in srgb, var(--dash-accent) 24%, transparent)" />
            <path d={String(path)} stroke="color-mix(in srgb, var(--dash-accent) 38%, transparent)" strokeWidth="1.5" />
            <circle cx={Number(x)} cy={Number(y)} r="4" fill="color-mix(in srgb, var(--dash-accent) 32%, transparent)" />
          </g>
        ))}
        <g filter="url(#glow)">
          <path
            d="M112 143c-25-1-43-18-43-42 0-22 16-38 36-39 9-20 27-30 48-26 16 3 29 13 35 27 19 1 34 17 34 37 0 22-17 39-39 40H112Z"
            fill="color-mix(in srgb, var(--dash-accent) 12%, white)"
            stroke="var(--dash-accent)"
            strokeWidth="4"
          />
          <path d="M102 112h71M122 92v42M148 85v55" stroke="var(--dash-accent)" strokeWidth="5" strokeLinecap="round" />
          <circle cx="102" cy="112" r="8" fill="var(--dash-accent)" />
          <circle cx="122" cy="92" r="8" fill="var(--dash-accent)" />
          <circle cx="122" cy="134" r="8" fill="var(--dash-accent)" />
          <circle cx="148" cy="85" r="8" fill="var(--dash-accent)" />
          <circle cx="148" cy="140" r="8" fill="var(--dash-accent)" />
          <circle cx="173" cy="112" r="8" fill="var(--dash-accent)" />
        </g>
        <defs>
          <filter id="glow" x="40" y="20" width="220" height="160">
            <feGaussianBlur stdDeviation="7" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
      </svg>
    </div>
  )
}
