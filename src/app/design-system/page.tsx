'use client'

import { Search, Sparkles, Command, ArrowRight, Download, Plus, Check } from 'lucide-react'
import {
  Button, Card, CardHeader, CardTitle, CardDescription, CardFooter,
  Badge, NodeTypeBadge, NODE_TYPES,
  Input, Textarea, Label,
  GlowWrap, DottedGlow,
} from '@/components/ui'
import { ThemeToggle } from '@/components/theme/ThemeToggle'
import { useTheme } from '@/components/theme/ThemeProvider'

export default function DesignSystemPage() {
  const { theme } = useTheme()

  return (
    <main className="min-h-screen">
      {/* ─── Top bar ───────────────────────────────────────── */}
      <header className="sticky top-0 z-50 glass-bright border-b border-[var(--border)]">
        <div className="mx-auto max-w-7xl px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-[var(--radius-sm)] metallic grid place-items-center">
              <Sparkles size={14} className="relative z-[1] text-[var(--accent-bright)]" />
            </div>
            <div>
              <div className="type-mono-xs text-[var(--text-muted)]">DESIGN · SYSTEM</div>
              <div className="type-h5 brushed-text">SecondBrain · Foundation</div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Badge tone="accent" dot>PHASE · 1</Badge>
            <Badge tone="neutral">theme: {theme}</Badge>
            <ThemeToggle />
          </div>
        </div>
      </header>

      {/* ─── Hero block ────────────────────────────────────── */}
      <DottedGlow scan className="border-b border-[var(--border)]">
        <section className="mx-auto max-w-7xl px-6 py-20 text-center relative">
          <Badge tone="accent" className="mb-5" dot>FOUNDATION LAYER · v0.1</Badge>
          <h1 className="type-display gradient-text">Apple Silicon meets YC paper</h1>
          <p className="type-body mt-5 mx-auto max-w-2xl">
            Dual-theme token system, six core primitives, one motion language. Everything downstream —
            hero, dashboard, wiki, ingest — will be assembled from these building blocks.
          </p>
          <div className="mt-8 flex items-center justify-center gap-3">
            <Button variant="primary" size="lg">Approve Phase 1 <ArrowRight size={16} /></Button>
            <Button variant="ghost" size="lg">View tokens</Button>
          </div>
        </section>
      </DottedGlow>

      <div className="mx-auto max-w-7xl px-6 py-16 space-y-20">

        {/* ─── Typography ────────────────────────────────── */}
        <Section title="Typography" eyebrow="01 · type scale">
          <Card variant="flat" padding="lg" className="space-y-4">
            <div className="type-display brushed-text">Display · SecondBrain</div>
            <div className="type-h1">H1 · Your second brain, wired.</div>
            <div className="type-h2">H2 · Ingest anything. Query everything.</div>
            <div className="type-h3">H3 · Compiled truth, timeline preserved.</div>
            <div className="type-h4">H4 · Source of record for knowledge work.</div>
            <div className="type-h5">H5 · Section label</div>
            <div className="type-h6">H6 · Eyebrow caption</div>
            <p className="type-body max-w-2xl">
              Body · The quick brown fox jumps over the lazy dog. Ligatures render cleanly, rag is
              balanced, letter-spacing tightens as size grows. We pair Inter for UI with a mono (JetBrains)
              for data-dense moments.
            </p>
            <p className="type-body-sm">Body-SM · secondary rank, used for dense lists and captions in context.</p>
            <p className="type-caption">CAPTION · METADATA · TIMESTAMPS</p>
            <p className="type-mono type-body-sm">mono · const truth = compile(timeline);</p>
          </Card>
        </Section>

        {/* ─── Colours ───────────────────────────────────── */}
        <Section title="Colour tokens" eyebrow="02 · palette">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {SWATCHES.map((s) => (
              <div
                key={s.var}
                className="rounded-[var(--radius-md)] border border-[var(--border-bright)] overflow-hidden"
              >
                <div className="h-20" style={{ background: `var(--${s.var})` }} />
                <div className="p-3">
                  <div className="type-mono-xs text-[var(--text-muted)]">--{s.var}</div>
                  <div className="type-body-sm text-[var(--text-primary)]">{s.label}</div>
                </div>
              </div>
            ))}
          </div>
        </Section>

        {/* ─── Surfaces ──────────────────────────────────── */}
        <Section title="Surfaces" eyebrow="03 · materials">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card variant="glass" padding="lg">
              <div className="type-mono-xs text-[var(--text-muted)]">.glass</div>
              <div className="type-h5 mt-2">Glassmorphism</div>
              <p className="type-body-sm mt-2">Blurred backdrop + hairline border. Used for floating panels and overlays.</p>
            </Card>
            <Card variant="metallic" padding="lg">
              <div className="type-mono-xs text-[var(--text-muted)]">.metallic</div>
              <div className="type-h5 mt-2 brushed-text">Apple Silicon</div>
              <p className="type-body-sm mt-2">Brushed gradient + inner highlight. Reserved for command-center elements.</p>
            </Card>
            <Card variant="outline" padding="lg">
              <div className="type-mono-xs text-[var(--text-muted)]">.outline</div>
              <div className="type-h5 mt-2">Editorial</div>
              <p className="type-body-sm mt-2">Transparent with a crisp border. Used in YC-paper context for lists.</p>
            </Card>
          </div>
        </Section>

        {/* ─── Buttons ───────────────────────────────────── */}
        <Section title="Buttons" eyebrow="04 · actions">
          <Card variant="flat" padding="lg" className="space-y-6">
            <Row label="Primary">
              <Button variant="primary" size="xs">XS</Button>
              <Button variant="primary" size="sm">Small</Button>
              <Button variant="primary" size="md">Default</Button>
              <Button variant="primary" size="lg">Large <ArrowRight size={16} /></Button>
              <Button variant="primary" size="xl">Ingest source <ArrowRight size={18} /></Button>
            </Row>
            <Row label="Metallic">
              <Button variant="metallic" size="md">Run diagnostic</Button>
              <Button variant="metallic" size="lg"><Command size={16} /> Command palette</Button>
            </Row>
            <Row label="Ghost / Soft / Link">
              <Button variant="ghost">Ghost</Button>
              <Button variant="soft">Soft accent</Button>
              <Button variant="link">Inline link</Button>
            </Row>
            <Row label="Icon">
              <Button variant="icon" size="iconSm" aria-label="add"><Plus size={14} /></Button>
              <Button variant="icon" size="iconMd" aria-label="download"><Download size={16} /></Button>
              <Button variant="icon" size="iconMd" aria-label="check"><Check size={16} /></Button>
            </Row>
            <Row label="Disabled">
              <Button disabled>Disabled</Button>
              <Button variant="ghost" disabled>Disabled ghost</Button>
            </Row>
          </Card>
        </Section>

        {/* ─── Badges ────────────────────────────────────── */}
        <Section title="Badges" eyebrow="05 · status & taxonomy">
          <Card variant="flat" padding="lg" className="space-y-5">
            <Row label="Tone">
              <Badge tone="neutral">Neutral</Badge>
              <Badge tone="accent" dot>Accent · live</Badge>
              <Badge tone="success" dot>Success</Badge>
              <Badge tone="warning">Warning</Badge>
              <Badge tone="danger">Danger</Badge>
              <Badge tone="info">Info</Badge>
              <Badge tone="violet">Violet</Badge>
            </Row>
            <Row label="Node types (graph-synced)">
              {NODE_TYPES.map((t) => (
                <NodeTypeBadge key={t} type={t} />
              ))}
            </Row>
          </Card>
        </Section>

        {/* ─── Inputs ────────────────────────────────────── */}
        <Section title="Inputs" eyebrow="06 · forms">
          <Card variant="flat" padding="lg" className="grid md:grid-cols-2 gap-6">
            <div>
              <Label>Search</Label>
              <Input placeholder="Ask your second brain…" icon={<Search size={14} />} />
            </div>
            <div>
              <Label>Vault name</Label>
              <Input placeholder="personal-os" suffix={<span className="type-mono-xs">.vault</span>} />
            </div>
            <div className="md:col-span-2">
              <Label>Source text</Label>
              <Textarea placeholder="Paste a transcript, article, or note to ingest…" />
            </div>
          </Card>
        </Section>

        {/* ─── Glow + backdrop primitives ────────────────── */}
        <Section title="Glow wrap + dotted glow" eyebrow="07 · motion primitives">
          <div className="grid md:grid-cols-2 gap-4">
            <GlowWrap always radius="var(--radius-lg)">
              <Card variant="metallic" padding="lg" className="h-full">
                <CardHeader>
                  <CardTitle className="brushed-text">Always-on glow</CardTitle>
                  <Badge tone="accent" dot>active</Badge>
                </CardHeader>
                <CardDescription>
                  Conic-gradient border rotates once per 22s. Reserved for CTAs and the knowledge-graph selection ring.
                </CardDescription>
                <CardFooter>
                  <span className="type-mono-xs text-[var(--text-muted)]">--orbit-speed · 22s</span>
                  <Button size="sm" variant="metallic">Inspect</Button>
                </CardFooter>
              </Card>
            </GlowWrap>

            <GlowWrap radius="var(--radius-lg)">
              <Card variant="glass" padding="lg" className="h-full">
                <CardHeader>
                  <CardTitle>Hover-triggered glow</CardTitle>
                  <Badge tone="neutral">hover</Badge>
                </CardHeader>
                <CardDescription>
                  Same primitive without <span className="type-mono">always</span>. Used for card grids where we
                  want engagement without distraction.
                </CardDescription>
                <CardFooter>
                  <span className="type-mono-xs text-[var(--text-muted)]">.glow-wrap</span>
                  <Button size="sm" variant="ghost">Try hover</Button>
                </CardFooter>
              </Card>
            </GlowWrap>
          </div>

          <div className="mt-4 rounded-[var(--radius-lg)] border border-[var(--border-bright)] overflow-hidden">
            <DottedGlow className="p-12 text-center">
              <div className="type-mono-xs text-[var(--text-muted)]">DOTTED · GLOW · SECTION</div>
              <h3 className="type-h2 gradient-text mt-2">Hero-ready backdrop</h3>
              <p className="type-body mt-3 max-w-lg mx-auto">
                Radial plume + masked dot grid. Drop any hero, dashboard shell, or empty state on top.
              </p>
            </DottedGlow>
          </div>
        </Section>

        {/* ─── Motion showcase ──────────────────────────── */}
        <Section title="Motion library" eyebrow="08 · animations">
          <Card variant="flat" padding="lg" className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {MOTION.map((m) => (
              <div
                key={m.cls}
                className="rounded-[var(--radius-md)] border border-[var(--border-bright)] bg-[var(--surface-2)] p-4 text-center"
              >
                <div className={`${m.cls} type-h5 gradient-text-static`}>{m.label}</div>
                <div className="type-mono-xs text-[var(--text-muted)] mt-2">.{m.cls}</div>
              </div>
            ))}
          </Card>
        </Section>

        {/* ─── Footer note ──────────────────────────────── */}
        <Card variant="outline" padding="lg" className="text-center">
          <div className="type-mono-xs text-[var(--text-muted)]">REVIEW · CHECKLIST</div>
          <h3 className="type-h3 mt-2">Ready for Phase 2?</h3>
          <p className="type-body mt-2 max-w-2xl mx-auto">
            Toggle dark ↔ light using the switch up top. If the two themes feel correct — metallic black for dark,
            cream paper for light — and the primitives read as premium, Phase 2 (Landing Hero with orbit animation)
            is unlocked.
          </p>
          <div className="mt-5 flex justify-center gap-3">
            <Button variant="primary">Approve Phase 1</Button>
            <Button variant="ghost">Request tweak</Button>
          </div>
        </Card>
      </div>
    </main>
  )
}

/* ── helpers ──────────────────────────────────────────── */
function Section({ title, eyebrow, children }: { title: string; eyebrow: string; children: React.ReactNode }) {
  return (
    <section>
      <div className="mb-5 flex items-baseline justify-between">
        <div>
          <div className="type-mono-xs text-[var(--text-muted)]">{eyebrow}</div>
          <h2 className="type-h2 mt-1">{title}</h2>
        </div>
      </div>
      {children}
    </section>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="type-mono-xs w-36 text-[var(--text-muted)]">{label}</div>
      <div className="flex flex-wrap items-center gap-2">{children}</div>
    </div>
  )
}

const SWATCHES = [
  { var: 'bg',            label: 'Background' },
  { var: 'surface',       label: 'Surface' },
  { var: 'surface-2',     label: 'Surface · elevated' },
  { var: 'border-bright', label: 'Border · bright' },
  { var: 'accent',        label: 'Accent' },
  { var: 'accent-bright', label: 'Accent · bright' },
  { var: 'accent-deep',   label: 'Accent · deep' },
  { var: 'emerald',       label: 'Emerald · signal' },
]

const MOTION = [
  { cls: 'float',       label: 'Float' },
  { cls: 'pulse-dot',   label: 'Pulse' },
  { cls: 'fade-up',     label: 'Fade up' },
  { cls: 'gradient-text', label: 'Shimmer' },
]
