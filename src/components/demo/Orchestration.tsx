'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { CheckCircle2, Loader2, Network, PenLine, Search, ShieldCheck, Briefcase, RotateCcw } from 'lucide-react'
import { ORCHESTRATION, type DemoIcon } from '@/lib/demo-data'

const ICONS: Record<DemoIcon, typeof Search> = {
  brief: Briefcase, search: Search, inbox: Network, pulse: ShieldCheck, pen: PenLine, orchestrate: Network,
}

// Plays the multi-agent orchestration: orchestrator dispatches, agents run
// their steps in parallel (staggered), then a merged result appears.
// `active` gates autoplay so it only runs when scrolled into view.
export function Orchestration({ active = true }: { active?: boolean }) {
  // progress[i] = how many steps of agent i are revealed
  const [progress, setProgress] = useState<number[]>(() => ORCHESTRATION.agents.map(() => 0))
  const [dispatched, setDispatched] = useState(false)
  const [done, setDone] = useState(false)
  const timers = useRef<ReturnType<typeof setTimeout>[]>([])

  const clear = () => { timers.current.forEach(clearTimeout); timers.current = [] }

  const play = useCallback(() => {
    clear()
    setProgress(ORCHESTRATION.agents.map(() => 0))
    setDispatched(false)
    setDone(false)

    timers.current.push(setTimeout(() => setDispatched(true), 600))

    let maxEnd = 1200
    ORCHESTRATION.agents.forEach((agent, ai) => {
      agent.steps.forEach((_, si) => {
        // each agent starts slightly offset; steps tick ~900ms apart
        const t = 1200 + ai * 250 + si * 950
        maxEnd = Math.max(maxEnd, t)
        timers.current.push(setTimeout(() => {
          setProgress(prev => {
            const next = [...prev]
            next[ai] = si + 1
            return next
          })
        }, t))
      })
    })

    timers.current.push(setTimeout(() => setDone(true), maxEnd + 900))
  }, [])

  useEffect(() => {
    if (!active) return
    const t = setTimeout(play, 400)
    return () => { clearTimeout(t); clear() }
  }, [play, active])

  return (
    <section className="dash-panel dash-panel-strong dash-grain p-5 lg:p-6">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-[var(--dash-border)] bg-[var(--dash-soft)] text-[var(--dash-accent)]">
            <Network className="h-5 w-5" />
          </span>
          <div>
            <h3 className="text-sm font-semibold text-[var(--dash-text-strong)]">Multi-agent orchestration</h3>
            <p className="mt-0.5 text-[12px] text-[var(--dash-muted)]">One objective → a coordinated team of specialist agents.</p>
          </div>
        </div>
        <button
          onClick={play}
          className="dash-inset inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-medium text-[var(--dash-text)] transition hover:border-[var(--dash-border-glow)]"
        >
          <RotateCcw className="h-3 w-3" /> Replay
        </button>
      </div>

      {/* objective */}
      <div className="dash-inset mb-4 rounded-xl px-3.5 py-3">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--dash-accent)]">Objective</p>
        <p className="mt-1 text-[13px] font-medium text-[var(--dash-text-strong)]">{ORCHESTRATION.objective}</p>
        {dispatched && (
          <p className="mt-2 text-[12px] leading-relaxed text-[var(--dash-muted)]">{ORCHESTRATION.orchestratorLine}</p>
        )}
      </div>

      {/* parallel agents */}
      <div className="grid gap-3 sm:grid-cols-2">
        {ORCHESTRATION.agents.map((agent, ai) => {
          const Icon = ICONS[agent.icon]
          const reveal = progress[ai]
          const finished = reveal >= agent.steps.length
          return (
            <div
              key={agent.name}
              className="rounded-xl border p-3.5 transition-all duration-500"
              style={{
                borderColor: dispatched ? `${agent.accent}55` : 'var(--dash-border)',
                background: 'var(--dash-card-strong)',
                boxShadow: dispatched && !finished ? `0 0 24px -10px ${agent.accent}` : 'none',
              }}
            >
              <div className="flex items-center gap-2.5">
                <span className="grid h-8 w-8 place-items-center rounded-lg border border-[var(--dash-border)]" style={{ color: agent.accent, background: `${agent.accent}14` }}>
                  <Icon className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-semibold text-[var(--dash-text-strong)]">{agent.name}</p>
                  <p className="truncate text-[11px] text-[var(--dash-muted)]">{agent.role}</p>
                </div>
                {dispatched && (
                  finished
                    ? <CheckCircle2 className="h-4 w-4 shrink-0" style={{ color: agent.accent }} />
                    : <Loader2 className="h-4 w-4 shrink-0 animate-spin" style={{ color: agent.accent }} />
                )}
              </div>

              <div className="mt-3 space-y-1.5">
                {agent.steps.slice(0, reveal).map((step, si) => (
                  <p key={si} className="flex items-start gap-1.5 text-[11px] text-[var(--dash-text)]">
                    <span style={{ color: agent.accent }}>·</span>
                    <Linkify text={step} accent={agent.accent} />
                  </p>
                ))}
                {dispatched && !finished && reveal < agent.steps.length && (
                  <p className="text-[11px] text-[var(--dash-subtle)]">working…</p>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* merged result */}
      {done && (
        <div
          className="dash-rise mt-4 rounded-xl border p-3.5"
          style={{ borderColor: 'color-mix(in srgb, var(--dash-accent) 30%, transparent)', background: 'color-mix(in srgb, var(--dash-accent) 6%, transparent)' }}
        >
          <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--dash-accent)]">
            <CheckCircle2 className="h-3 w-3" /> Merged result
          </p>
          <p className="mt-1.5 text-[13px] leading-relaxed text-[var(--dash-text)]">
            <Linkify text={ORCHESTRATION.result} accent="var(--dash-accent)" />
          </p>
        </div>
      )}
    </section>
  )
}

// renders **bold** and [[links]] inline
function Linkify({ text, accent }: { text: string; accent: string }) {
  const html = text
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/\*\*([^*]+)\*\*/g, '<strong class="text-[var(--dash-text-strong)]">$1</strong>')
    .replace(/\[\[([^\]]+)\]\]/g, `<span style="color:${accent}">$1</span>`)
  return <span dangerouslySetInnerHTML={{ __html: html }} />
}
