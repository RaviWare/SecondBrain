'use client'

import { useEffect, useRef, useState } from 'react'
import {
  Activity, Briefcase, Inbox, Network, PenLine, Search,
} from 'lucide-react'
import { ScenePlayer } from '@/components/demo/ScenePlayer'
import { Orchestration } from '@/components/demo/Orchestration'
import { DEMO_SCENES, type DemoIcon } from '@/lib/demo-data'

const SCENE_ICON: Record<DemoIcon, typeof Search> = {
  brief: Briefcase, search: Search, inbox: Inbox, pulse: Activity, pen: PenLine, orchestrate: Network,
}

// Premium, conversion-focused "see it in action" section for the landing page.
// Embeds the live multi-scene agent demo (no signup, sample data) so prospects
// experience the product before buying. Wrapped in `.sb-dashboard` so the demo
// uses the Apple-silicon glass token system regardless of the page theme.
export function AgentShowcase() {
  const [tab, setTab] = useState<string>(DEMO_SCENES[0].id)
  const [visible, setVisible] = useState(false)
  const sectionRef = useRef<HTMLElement>(null)
  const scene = DEMO_SCENES.find(s => s.id === tab)

  // Only auto-play the demo once the section scrolls into view — so it never
  // fights the user's scroll while they're still up at the hero.
  useEffect(() => {
    const node = sectionRef.current
    if (!node) return
    const obs = new IntersectionObserver(
      entries => entries.forEach(e => { if (e.isIntersecting) setVisible(true) }),
      { threshold: 0.25 }
    )
    obs.observe(node)
    return () => obs.disconnect()
  }, [])

  return (
    <section ref={sectionRef} id="see-it" className="relative scroll-mt-28 overflow-hidden py-12 md:scroll-mt-32 md:py-28">
      <div className="absolute inset-0 dot-bg opacity-25" />
      <div
        aria-hidden
        className="absolute inset-x-0 top-0 h-px"
        style={{ background: 'linear-gradient(90deg, transparent, var(--border-bright), transparent)' }}
      />

      <div className="relative mx-auto max-w-7xl px-4 md:px-6">
        {/* section header */}
        <div className="mb-7 text-center md:mb-12">
          <p className="type-mono-xs mb-3 tracking-widest text-[var(--text-muted)]">SEE IT IN ACTION</p>
          <h2 className="text-[1.9rem] font-semibold leading-tight tracking-tight md:text-5xl">
            A team of 24/7 agents,
            <span className="block brushed-text">running on your second brain.</span>
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-sm leading-6 text-[var(--text-secondary)] md:text-base md:leading-8">
            Each agent specializes. Together they orchestrate. Every answer is grounded in your
            private vault and cited. Pick a workflow and watch it work — live, with sample data, no signup.
          </p>
        </div>

        {/* the demo, in the dashboard token scope */}
        <div className="sb-dashboard sb-dashboard--inline relative rounded-3xl">
          {/* scene navigator */}
          <nav className="mb-4 flex flex-wrap justify-center gap-2">
            {DEMO_SCENES.map(s => {
              const Icon = SCENE_ICON[s.icon]
              const active = tab === s.id
              return (
                <button
                  key={s.id}
                  onClick={() => setTab(s.id)}
                  className="inline-flex items-center gap-2 rounded-xl border px-3.5 py-2 text-[13px] font-medium transition"
                  style={active
                    ? { borderColor: `${s.accent}66`, background: `${s.accent}14`, color: s.accent }
                    : { borderColor: 'var(--dash-border)', color: 'var(--dash-text)' }}
                >
                  <Icon className="h-4 w-4" />
                  {s.name}
                </button>
              )
            })}
            <button
              onClick={() => setTab('orchestrate')}
              className="inline-flex items-center gap-2 rounded-xl border px-3.5 py-2 text-[13px] font-semibold transition"
              style={tab === 'orchestrate'
                ? { borderColor: 'var(--dash-border-glow)', background: 'var(--dash-accent-soft)', color: 'var(--dash-accent)' }
                : { borderColor: 'var(--dash-border)', color: 'var(--dash-text)' }}
            >
              <Network className="h-4 w-4" />
              Multi-agent
              <span className="rounded-full bg-[var(--dash-accent)] px-1.5 py-0.5 text-[9px] font-bold text-white">NEW</span>
            </button>
          </nav>

          {/* tagline */}
          <p className="mb-4 text-center text-[13px] text-[var(--dash-muted)]">
            {tab === 'orchestrate' ? (
              <><span className="font-semibold text-[var(--dash-text-strong)]">Multi-agent orchestration.</span> Hand off a big objective; specialist agents split the work and merge results.</>
            ) : scene ? (
              <><span className="font-semibold text-[var(--dash-text-strong)]">{scene.name}.</span> {scene.tagline}</>
            ) : null}
          </p>

          {/* stage */}
          <div key={tab} className="dash-rise mx-auto max-w-3xl">
            {tab === 'orchestrate' ? <Orchestration active={visible} /> : scene ? <ScenePlayer scene={scene} active={visible} /> : null}
          </div>
        </div>
      </div>
    </section>
  )
}
