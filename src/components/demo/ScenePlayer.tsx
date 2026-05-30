'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import {
  Bot, Clock, Database, FileEdit, Globe, Loader2, Mail, RotateCcw, Search, Send, ShieldAlert, Share2,
} from 'lucide-react'
import type { DemoScene, DemoTurn, ToolKind } from '@/lib/demo-data'

const TOOL_ICON: Record<ToolKind, typeof Search> = {
  search: Search, ingest: Database, cron: Clock, web: Globe, mail: Mail,
  draft: FileEdit, alert: ShieldAlert, handoff: Share2,
}

// Plays one scene's scripted conversation with realistic pacing.
// `active` gates autoplay so it only runs when the showcase is on-screen.
export function ScenePlayer({ scene, active = true }: { scene: DemoScene; active?: boolean }) {
  const [shown, setShown] = useState<DemoTurn[]>([])
  const [thoughts, setThoughts] = useState<string[]>([])
  const [playing, setPlaying] = useState(false)
  const [done, setDone] = useState(false)
  const scrollBoxRef = useRef<HTMLDivElement>(null)
  const timers = useRef<ReturnType<typeof setTimeout>[]>([])

  const clear = () => { timers.current.forEach(clearTimeout); timers.current = [] }
  // Scroll ONLY the inner chat container — never the page. Using scrollIntoView
  // here would yank the whole landing page down while the demo auto-plays.
  const scrollDown = useCallback(() => {
    const box = scrollBoxRef.current
    if (box) box.scrollTo({ top: box.scrollHeight, behavior: 'smooth' })
  }, [])

  const play = useCallback(() => {
    clear()
    setShown([]); setThoughts([]); setDone(false); setPlaying(true)
    let delay = 400
    scene.conversation.forEach((turn) => {
      if (turn.role === 'agent' && turn.thinking) {
        turn.thinking.forEach((line, li) => {
          timers.current.push(setTimeout(() => { setThoughts(prev => [...prev, line]); scrollDown() }, delay + li * 650))
        })
        delay += turn.thinking.length * 650 + 450
        return
      }
      timers.current.push(setTimeout(() => { setThoughts([]); setShown(prev => [...prev, turn]); scrollDown() }, delay))
      delay += turn.role === 'agent' ? 1700 : turn.role === 'tool' ? 850 : 1000
    })
    timers.current.push(setTimeout(() => { setPlaying(false); setDone(true) }, delay))
  }, [scene, scrollDown])

  // Restart whenever the scene changes — but only once the showcase is visible.
  useEffect(() => {
    if (!active) return
    const t = setTimeout(play, 250)
    return () => { clearTimeout(t); clear() }
  }, [play, active])

  return (
    <section className="dash-panel dash-panel-strong dash-grain flex h-[560px] flex-col p-4">
      <div className="mb-3 flex items-center justify-between border-b border-[var(--dash-border)] pb-3">
        <div className="flex items-center gap-2.5">
          <span className="grid h-9 w-9 place-items-center rounded-xl border border-[var(--dash-border)]" style={{ color: scene.accent, background: `${scene.accent}14` }}>
            <Bot className="h-5 w-5" />
          </span>
          <div>
            <p className="flex items-center gap-2 text-sm font-semibold text-[var(--dash-text-strong)]">
              {scene.agentName}
              <span className="h-2 w-2 rounded-full bg-emerald-400 dash-live-dot" />
            </p>
            <p className="text-[11px] text-[var(--dash-muted)]">{scene.vaultLabel} · always-on</p>
          </div>
        </div>
        <button
          onClick={play}
          disabled={playing}
          className="dash-inset inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-medium text-[var(--dash-text)] transition hover:border-[var(--dash-border-glow)] disabled:opacity-50"
        >
          {playing ? <Loader2 className="h-3 w-3 animate-spin" /> : <RotateCcw className="h-3 w-3" />}
          {playing ? 'Playing…' : 'Replay'}
        </button>
      </div>

      <div ref={scrollBoxRef} className="flex-1 space-y-3 overflow-y-auto pr-1">
        {shown.map((turn, i) => <TurnBubble key={i} turn={turn} accent={scene.accent} />)}
        {thoughts.length > 0 && (
          <div className="flex items-center gap-2 text-[12px] text-[var(--dash-muted)]">
            <Loader2 className="h-3.5 w-3.5 animate-spin" style={{ color: scene.accent }} />
            <span>{thoughts[thoughts.length - 1]}</span>
          </div>
        )}
      </div>

      <div className="mt-3 flex items-center gap-2 rounded-xl border border-[var(--dash-border)] bg-[var(--dash-card-strong)] p-1.5 opacity-80">
        <input
          disabled
          placeholder={done ? 'Preview — start your own to chat' : 'Agent is working…'}
          className="min-w-0 flex-1 bg-transparent px-2.5 text-sm text-[var(--dash-text)] outline-none placeholder:text-[var(--dash-subtle)]"
        />
        <Link href="/sign-up" className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-white" style={{ background: `linear-gradient(135deg, ${scene.accent}, var(--dash-accent))` }}>
          <Send className="h-4 w-4" />
        </Link>
      </div>
    </section>
  )
}

function TurnBubble({ turn, accent }: { turn: DemoTurn; accent: string }) {
  if (turn.role === 'user') {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-2xl rounded-tr-sm px-3.5 py-2.5 text-[13px] font-medium text-white" style={{ background: `linear-gradient(135deg, ${accent}, var(--dash-accent))` }}>
          {turn.content}
        </div>
      </div>
    )
  }
  if (turn.role === 'tool') {
    const Icon = TOOL_ICON[turn.tool]
    return (
      <div className="flex items-center gap-2 text-[11px] text-[var(--dash-muted)]">
        <span className="grid h-6 w-6 place-items-center rounded-md border border-[var(--dash-border)]" style={{ color: accent, background: `${accent}14` }}>
          <Icon className="h-3 w-3" />
        </span>
        <span className="dash-inset rounded-full px-2.5 py-1 font-medium">{turn.label}</span>
      </div>
    )
  }
  return (
    <div className="max-w-[88%]">
      <div className="rounded-2xl rounded-tl-sm border border-[var(--dash-border)] bg-[var(--dash-card-strong)] px-3.5 py-2.5 text-[13px] leading-relaxed text-[var(--dash-text)]">
        <Markdownish text={turn.content} accent={accent} />
      </div>
    </div>
  )
}

function Markdownish({ text, accent }: { text: string; accent: string }) {
  const html = text
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/\*\*([^*]+)\*\*/g, '<strong class="text-[var(--dash-text-strong)]">$1</strong>')
    .replace(/\[\[([^\]]+)\]\]/g, `<span style="color:${accent}">$1</span>`)
    .replace(/^&gt; (.*)$/gm, '<span class="block border-l-2 pl-2 my-0.5" style="border-color:' + accent + '40">$1</span>')
    .replace(/\n/g, '<br/>')
  return <span dangerouslySetInnerHTML={{ __html: html }} />
}
