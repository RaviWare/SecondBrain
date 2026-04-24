'use client'

/**
 * Testimonials — aura.build 258B361 inspired
 * ------------------------------------------
 *  · Two marquee rows scrolling in opposite directions
 *  · Glass cards with hover-pause and conic-glow on hover
 *  · Header block with eyebrow + shimmer headline
 *  · Pure CSS marquee (no JS RAF) — respects prefers-reduced-motion
 *  · Theme-aware via Phase 1 tokens
 */
import { Badge } from '@/components/ui'
import { cn } from '@/lib/utils'
import { Quote as QuoteIcon } from 'lucide-react'

type Quote = {
  body: string
  name: string
  role: string
  company: string
  initials: string
  accent?: 'accent' | 'silver'
}

const ROW_A: Quote[] = [
  {
    body: "I stopped losing context between projects. My second brain answers questions I didn't know I'd already solved six months ago — with citations.",
    name: 'Ava Chen', role: 'Founder', company: 'Lattice Labs', initials: 'AC', accent: 'accent',
  },
  {
    body: "The timeline preservation is the killer feature. Every ingested source stays dated and linked — it's a git log for my thinking.",
    name: 'Marcus Okafor', role: 'Staff Engineer', company: 'Cohere', initials: 'MO', accent: 'silver',
  },
  {
    body: 'Ingested three years of meeting transcripts in an afternoon. The knowledge graph surfaced connections I never noticed.',
    name: 'Priya Ramanathan', role: 'Head of Research', company: 'Anthropic', initials: 'PR', accent: 'accent',
  },
  {
    body: "The [[slug]] citations changed how I trust LLM output. I click through and verify before I ship. That's non-negotiable for me now.",
    name: 'Jonas Weber', role: 'CTO', company: 'Runway', initials: 'JW', accent: 'silver',
  },
  {
    body: 'It feels like a premium AI memory workspace rather than another note app. Minimal, fast, and the graph view is genuinely useful.',
    name: 'Sana Al-Rashid', role: 'Design Lead', company: 'Linear', initials: 'SR', accent: 'silver',
  },
]

const ROW_B: Quote[] = [
  {
    body: "We replaced a Notion wiki maintained by three people with this. Ingestion is automatic, truth stays compiled, nobody argues about structure.",
    name: 'Diego Santos', role: 'Eng Manager', company: 'Vercel', initials: 'DS', accent: 'silver',
  },
  {
    body: "My MacBook feels like a command center now. Dashboard at a glance, query when I need it, wiki when I'm reading deeply. That's the whole stack.",
    name: 'Emily Tran', role: 'PM', company: 'Notion', initials: 'ET', accent: 'accent',
  },
  {
    body: "The ingest queue watching sources turn into connected memory pages is oddly satisfying. It's the only SaaS I've opened a second tab just to watch.",
    name: 'Kai Nakamura', role: 'Indie Hacker', company: 'Solo', initials: 'KN', accent: 'accent',
  },
  {
    body: "I pasted a 90-minute YouTube transcript and got back a structured wiki with entities, events, and relations. That workflow used to take me a full Sunday.",
    name: 'Olivia Park', role: 'Creator', company: 'Substack', initials: 'OP', accent: 'silver',
  },
  {
    body: 'Premium feel without the bloat. It respects my keyboard, my data, and my time — which is rare for AI tools in 2026.',
    name: 'Rahul Mehta', role: 'Investor', company: 'Sequoia', initials: 'RM', accent: 'silver',
  },
]

export function Testimonials() {
  return (
    <section id="testimonials" className="relative py-20 md:py-28 overflow-hidden">
      {/* soft plume */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          background:
            'radial-gradient(ellipse 60% 40% at 50% 0%, color-mix(in srgb, var(--accent) 10%, transparent), transparent 70%)',
        }}
      />

      {/* ── Header ───────────────────────────────────────── */}
      <div className="mx-auto max-w-7xl px-4 md:px-6 text-center">
        <Badge tone="accent" dot className="mb-4">LOVED · BY · KNOWLEDGE · WORKERS</Badge>
        <h2 className="type-h1 gradient-text">Thinking, compiled.</h2>
        <p className="type-body mt-4 mx-auto max-w-2xl">
          Early users ingesting transcripts, papers, meeting notes, and raw thought streams —
          turning them into cited, linked, timeline-aware knowledge.
        </p>
      </div>

      {/* ── Marquee rows ─────────────────────────────────── */}
      <div className="mt-10 md:mt-14 space-y-4 md:space-y-5" aria-label="testimonials">
        <Marquee items={ROW_A} direction="left" duration={60} />
        <Marquee items={ROW_B} direction="right" duration={72} />
      </div>

      {/* edge fades */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-y-0 left-0 w-24 md:w-40 z-10"
        style={{
          background: 'linear-gradient(90deg, var(--bg), transparent)',
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-y-0 right-0 w-24 md:w-40 z-10"
        style={{
          background: 'linear-gradient(-90deg, var(--bg), transparent)',
        }}
      />

      <style jsx>{`
        @keyframes marquee-left  { from { transform: translateX(0); }      to { transform: translateX(-50%); } }
        @keyframes marquee-right { from { transform: translateX(-50%); }   to { transform: translateX(0); } }
        @media (prefers-reduced-motion: reduce) {
          :global(.marquee-track) { animation: none !important; }
        }
      `}</style>
    </section>
  )
}

/* ─────────────────────────────────────────────────────── */
function Marquee({ items, direction, duration }: { items: Quote[]; direction: 'left' | 'right'; duration: number }) {
  // Duplicate once so translateX(-50%) wraps seamlessly
  const doubled = [...items, ...items]
  return (
    <div className="group relative overflow-hidden">
      <div
        className="marquee-track flex gap-5 w-max will-change-transform group-hover:[animation-play-state:paused]"
        style={{
          animation: `marquee-${direction} ${duration}s linear infinite`,
        }}
      >
        {doubled.map((q, i) => (
          <TestimonialCard key={`${direction}-${i}`} quote={q} />
        ))}
      </div>
    </div>
  )
}

/* ─────────────────────────────────────────────────────── */
const ACCENT_VAR: Record<NonNullable<Quote['accent']>, string> = {
  accent: 'var(--accent)',
  silver: '#c8c8cf',
}

function TestimonialCard({ quote }: { quote: Quote }) {
  const accent = ACCENT_VAR[quote.accent ?? 'accent']
  return (
    <figure
      className={cn(
        'relative shrink-0 w-[288px] sm:w-[320px] md:w-[420px] p-5 md:p-6 rounded-[var(--radius-lg)]',
        'glass border border-[var(--border)]',
        'transition-all duration-500 ease-out',
        'hover:-translate-y-1 hover:border-[var(--border-glow)]',
        'hover:shadow-[var(--shadow-2)]'
      )}
      style={{ ['--card-accent' as string]: accent }}
    >
      {/* subtle top accent line */}
      <span
        aria-hidden
        className="absolute left-6 right-6 top-0 h-px opacity-50"
        style={{
          background: `linear-gradient(90deg, transparent, ${accent}, transparent)`,
        }}
      />

      <QuoteIcon size={18} className="opacity-40" style={{ color: accent }} />

      <blockquote className="mt-3 type-body-sm text-[var(--text-primary)] leading-relaxed">
        &ldquo;{quote.body}&rdquo;
      </blockquote>

      <figcaption className="mt-5 flex items-center gap-3">
        <span
          className="grid place-items-center h-10 w-10 rounded-full border text-xs font-semibold"
          style={{
            borderColor: `color-mix(in srgb, ${accent} 38%, transparent)`,
            background: `color-mix(in srgb, ${accent} 14%, transparent)`,
            color: accent,
          }}
        >
          {quote.initials}
        </span>
        <div className="min-w-0">
          <div className="text-sm text-[var(--text-primary)] truncate">{quote.name}</div>
          <div className="type-mono-xs text-[var(--text-muted)] truncate">
            {quote.role} · {quote.company}
          </div>
        </div>
      </figcaption>
    </figure>
  )
}
