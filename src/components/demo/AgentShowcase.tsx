'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import {
  Activity, ArrowRight, Bot, Brain, Briefcase, CheckCircle2,
  ChevronRight, Clock, Database, FileText, FlaskConical,
  Inbox, Loader2, MessageCircle, Network, PenLine, Plus,
  RotateCcw, Search, Send, Shield, ShieldCheck, Smartphone,
  Sparkles, User, Wand2,
} from 'lucide-react'
import { ScenePlayer } from '@/components/demo/ScenePlayer'
import { Orchestration } from '@/components/demo/Orchestration'
import { DEMO_SCENES, type DemoIcon } from '@/lib/demo-data'

// ── Squad roster shown in the left sidebar ─────────────────────────────────────
const SQUAD = [
  { name: 'Ranger', role: 'Scout', status: 'active', task: 'Scanning 14 sources…', accent: '#38bdf8', icon: Search },
  { name: 'Sage', role: 'Synthesist', status: 'active', task: 'Writing EU brief…', accent: '#a78bfa', icon: Brain },
  { name: 'Sentinel', role: 'Critic', status: 'idle', task: 'Next run: 7:00 AM', accent: '#fb923c', icon: Shield },
  { name: 'Dewey', role: 'Librarian', status: 'idle', task: 'Last: filed 4 notes', accent: '#34d399', icon: Database },
  { name: 'Sherlock', role: 'Researcher', status: 'active', task: 'Comparing 6 sources…', accent: '#f472b6', icon: FlaskConical },
]

// ── Vault feed items ────────────────────────────────────────────────────────────
const VAULT_FEED = [
  { type: 'SOURCE', label: 'Northwind renewal transcript', time: '4m ago', accent: '#38bdf8', icon: FileText },
  { type: 'SYNTHESIS', label: 'EU market brief — 14 sources cited', time: '1h ago', accent: '#a78bfa', icon: Brain },
  { type: 'DECISION', label: 'Beta Co. churn risk logged', time: '3h ago', accent: '#fb923c', icon: Shield },
  { type: 'AGENT', label: 'Competitor scan → [[acme-scan]]', time: '5h ago', accent: '#34d399', icon: Bot },
  { type: 'DELIVERY', label: 'Weekly digest → Telegram ✓', time: 'yesterday', accent: '#f472b6', icon: Smartphone },
]

// ── Mission kanban ──────────────────────────────────────────────────────────────
const MISSION_CARDS = {
  planning: [
    { title: 'Q4 pricing strategy review', agent: 'Sage', priority: 'HIGH' },
  ],
  running: [
    { title: 'EU go-to-market brief', agent: 'Ranger + Sherlock', priority: 'HIGH' },
    { title: 'Competitor pain-theme map', agent: 'Sentinel', priority: 'MED' },
    { title: 'Weekly digest compilation', agent: 'Dewey', priority: 'LOW' },
  ],
  done: [
    { title: 'Northwind renewal prep', agent: 'Sage', priority: 'HIGH' },
    { title: 'Onboarding funnel analysis', agent: 'Sherlock', priority: 'MED' },
  ],
}

// ── Skills catalog preview ──────────────────────────────────────────────────────
const SKILL_CATEGORIES = [
  { name: 'Research', count: 7, accent: '#38bdf8', skills: ['Literature Review', 'Competitor Scan', 'Trend Spotter', 'Fact Checker', 'Question Explorer', 'Source Comparison', 'Background Briefer'] },
  { name: 'Sales', count: 7, accent: '#ff7a1f', skills: ['Deal Recap', 'Objection Handler', 'Pipeline Reviewer', 'Follow-up Drafter', 'Champion Tracker', 'Account Planner', 'Discovery Summarizer'] },
  { name: 'Productivity', count: 7, accent: '#34d399', skills: ['Daily Briefing', 'Weekly Review', 'Task Extractor', 'Standup Prep', 'Priority Sorter', 'Commitment Tracker', 'Meeting Notes Cleaner'] },
  { name: 'Operations', count: 7, accent: '#a78bfa', skills: ['Risk Radar', 'Contradiction Finder', 'Process Mapper', 'Incident Reviewer', 'Decision Logger', 'Stale Content Auditor', 'Dependency Checker'] },
  { name: 'Content', count: 7, accent: '#fb923c', skills: ['Blog Drafter', 'Newsletter Builder', 'Social Repurposer', 'Summary Writer', 'FAQ Generator', 'Outline Builder', 'Tone Editor'] },
  { name: 'Knowledge', count: 7, accent: '#22d3ee', skills: ['Knowledge Gaps', 'Glossary Builder', 'Timeline Builder', 'Entity Profiler', 'Connection Finder', 'Concept Explainer', 'Duplicate Detector'] },
  { name: 'Planning', count: 7, accent: '#60a5fa', skills: ['Project Tracker', 'Goal Breakdown', 'Roadmap Summarizer', 'Scenario Planner', 'Milestone Checker', 'Capacity Reviewer', 'Retro Facilitator'] },
  { name: 'Finance', count: 7, accent: '#4ade80', skills: ['Spend Reviewer', 'Budget Summarizer', 'Renewal Watcher', 'Invoice Tracker', 'Cost Comparer', 'Expense Categorizer', 'ROI Analyzer'] },
]

// ── Agent-proposed skills (auto-detected from vault patterns) ─────────────────
const AGENT_PROPOSED_SKILLS = [
  {
    agent: 'Ranger',
    agentAccent: '#38bdf8',
    skillName: 'Deal Velocity Tracker',
    reason: 'I noticed 12 Northwind-style deal pages in your vault with no follow-up logged. This skill would auto-flag stalled deals weekly.',
    trigger: 'Pattern detected in 12 vault pages',
    category: 'Sales',
    confidence: 94,
  },
  {
    agent: 'Sage',
    agentAccent: '#a78bfa',
    skillName: 'Competitor Price Watcher',
    reason: 'Your EU market brief referenced 6 competitor pricing pages. I can watch those URLs weekly and ping you when prices change.',
    trigger: 'Referenced in [[eu-market-scan]]',
    category: 'Research',
    confidence: 88,
  },
  {
    agent: 'Sherlock',
    agentAccent: '#f472b6',
    skillName: 'Churn Signal Detector',
    reason: 'Beta Co. churn risk was flagged manually. I can auto-scan usage-drop signals from your notes every 48 hours.',
    trigger: 'Flagged from [[beta-co-churn-risk]]',
    category: 'Operations',
    confidence: 91,
  },
]

// ── Custom skill builder steps (animated walkthrough) ─────────────────────────
const BUILDER_STEPS = [
  { label: 'Name your skill', value: 'Monthly Investor Digest', icon: Wand2, color: '#a78bfa' },
  { label: 'Describe its purpose', value: 'Summarize vault decisions, progress, and risks for my investors in plain English.', icon: FileText, color: '#38bdf8' },
  { label: 'Set the trigger', value: 'Schedule: 1st of every month at 8 AM', icon: Clock, color: '#34d399' },
  { label: 'Assign to agent', value: 'Sage (Synthesist)', icon: Bot, color: '#fb923c' },
  { label: 'Choose delivery', value: 'Email + save to vault', icon: Send, color: '#f472b6' },
]


const DELIVERY_LOG = [
  { channel: 'Telegram', agent: 'Sage', message: '🌅 Morning briefing: 4 items need you today. Northwind MSA redlined — 2 clauses changed. Beta Co. usage down 40%…', time: '7:00 AM', icon: Smartphone, accent: '#38bdf8', sent: true },
  { channel: 'Discord', agent: 'Sentinel', message: '⚠️ Risk alert: Pricing page change dropped signups 32%. Correlation: high. See [[decision-pricing-v2]] in vault.', time: '9:15 AM', icon: MessageCircle, accent: '#a78bfa', sent: true },
  { channel: 'Email', agent: 'Dewey', message: '📋 Weekly digest: 14 sources added, 3 decisions logged, 2 gaps flagged. Full brief in your vault.', time: '6:00 PM', icon: Send, accent: '#34d399', sent: false },
]

// ── Tabs ────────────────────────────────────────────────────────────────────────
type Tab = 'vault' | 'squad' | 'mission' | 'skills' | 'delivery' | 'sales' | 'research' | 'ops' | 'content' | 'orchestrate'

const SCENE_TABS = [
  { id: 'sales', label: 'Sales Copilot', icon: Briefcase, accent: '#ff7a1f' },
  { id: 'research', label: 'Researcher', icon: Search, accent: '#38bdf8' },
  { id: 'inbox', label: 'Inbox Triage', icon: Inbox, accent: '#34d399' },
  { id: 'ops', label: 'Ops Monitor', icon: Activity, accent: '#a78bfa' },
  { id: 'content', label: 'Content Engine', icon: PenLine, accent: '#fb923c' },
] as const

const MAIN_TABS = [
  { id: 'orchestrate' as Tab, label: 'Mission', icon: Network, accent: '#a78bfa', badge: 'LIVE' },
  { id: 'squad' as Tab, label: 'Squad', icon: Bot, accent: '#38bdf8', badge: null },
  { id: 'skills' as Tab, label: '100+ Skills', icon: Sparkles, accent: '#fb923c', badge: null },
  { id: 'delivery' as Tab, label: 'Delivery', icon: Smartphone, accent: '#34d399', badge: null },
  { id: 'vault' as Tab, label: 'Vault', icon: Database, accent: '#60a5fa', badge: null },
]

const SCENE_ICON: Record<DemoIcon, typeof Search> = {
  brief: Briefcase, search: Search, inbox: Inbox, pulse: Activity, pen: PenLine, orchestrate: Network,
}

// ──────────────────────────────────────────────────────────────────────────────
export function AgentShowcase() {
  const [tab, setTab] = useState<Tab>('orchestrate')
  const [visible, setVisible] = useState(false)
  const [selectedCat, setSelectedCat] = useState(0)
  const [deliveryIdx, setDeliveryIdx] = useState(0)
  const [squadPulse, setSquadPulse] = useState(0)
  const [skillView, setSkillView] = useState<'library' | 'build' | 'agent'>('library')
  const sectionRef = useRef<HTMLElement>(null)
  const scene = DEMO_SCENES.find(s => s.id === tab)
  const isSceneTab = DEMO_SCENES.some(s => s.id === tab)
  const activeColor = MAIN_TABS.find(t => t.id === tab)?.accent || scene?.accent || '#a78bfa'

  // Intersection observer — only autoplay once visible
  useEffect(() => {
    const node = sectionRef.current
    if (!node) return
    const obs = new IntersectionObserver(
      entries => entries.forEach(e => { if (e.isIntersecting) setVisible(true) }),
      { threshold: 0.15 }
    )
    obs.observe(node)
    return () => obs.disconnect()
  }, [])

  // Animate squad pulse when squad tab is active
  useEffect(() => {
    if (tab !== 'squad') return
    const t = setInterval(() => setSquadPulse(p => (p + 1) % SQUAD.length), 2000)
    return () => clearInterval(t)
  }, [tab])

  // Cycle delivery preview
  useEffect(() => {
    if (tab !== 'delivery') return
    const t = setInterval(() => setDeliveryIdx(i => (i + 1) % DELIVERY_LOG.length), 3500)
    return () => clearInterval(t)
  }, [tab])

  return (
    <section ref={sectionRef} id="see-it" className="relative scroll-mt-20 overflow-hidden py-10 md:scroll-mt-32 md:py-28">
      <div className="absolute inset-0 dot-bg opacity-20" />
      <div
        aria-hidden
        className="absolute inset-x-0 top-0 h-px"
        style={{ background: 'linear-gradient(90deg, transparent, var(--border-bright), transparent)' }}
      />
      {/* Dynamic glow */}
      <div
        aria-hidden
        className="absolute left-1/2 top-1/2 -z-10 h-[600px] w-[700px] -translate-x-1/2 -translate-y-1/2 rounded-full opacity-[0.12] blur-[150px] transition-all duration-1000 pointer-events-none"
        style={{ backgroundColor: activeColor }}
      />

      <div className="relative mx-auto max-w-7xl px-4 md:px-6">
        {/* Header */}
        <div className="mb-5 text-center md:mb-10">
          <p className="type-mono-xs mb-2 tracking-widest text-[var(--text-muted)]">SEE IT IN ACTION</p>
          <h2 className="text-[1.5rem] md:text-5xl font-semibold leading-[1.15] tracking-tight">
            Your squad. Live in your brain.
            <span className="block brushed-text">Watch them work.</span>
          </h2>
          <p className="mx-auto mt-2 max-w-2xl text-[12.5px] leading-[1.6] text-[var(--text-secondary)] md:text-base md:leading-8 hidden sm:block">
            Named agents. 100+ skills. Mission orchestration. Vault-grounded cited answers. Delivered to Telegram, Discord, and email.
          </p>
        </div>

        <div className="sb-dashboard sb-dashboard--inline sb-dashboard-clean relative rounded-3xl">

          {/* ── Single scrollable tab bar (mobile-first) ── */}
          <div className="mb-5 overflow-x-auto pb-1 -mx-4 px-4 md:mx-0 md:px-0">
            <div className="flex items-center gap-2 min-w-max md:flex-wrap md:min-w-0 md:justify-center">
              {MAIN_TABS.map(t => {
                const Icon = t.icon
                const active = tab === t.id
                return (
                  <button
                    key={t.id}
                    onClick={() => setTab(t.id)}
                    className="inline-flex items-center gap-1.5 rounded-xl border px-3 md:px-4 py-2 text-[12px] md:text-[13px] font-semibold transition duration-300 whitespace-nowrap"
                    style={active
                      ? { borderColor: `${t.accent}88`, background: `${t.accent}1e`, color: t.accent, boxShadow: `0 0 20px -6px ${t.accent}55` }
                      : { borderColor: 'var(--dash-border)', color: 'var(--dash-text)', background: 'var(--dash-card-solid)' }}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {t.label}
                    {t.badge && (
                      <span className="rounded-full px-1.5 py-0.5 text-[9px] font-bold text-white" style={{ background: t.accent }}>
                        {t.badge}
                      </span>
                    )}
                  </button>
                )
              })}
              <div className="w-px h-5 bg-[var(--dash-border)] shrink-0" />
              {SCENE_TABS.map(t => {
                const Icon = t.icon
                const active = tab === t.id
                return (
                  <button
                    key={t.id}
                    onClick={() => setTab(t.id as Tab)}
                    className="inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-[11px] md:text-[12px] font-medium transition duration-200 whitespace-nowrap"
                    style={active
                      ? { borderColor: `${t.accent}66`, background: `${t.accent}14`, color: t.accent }
                      : { borderColor: 'var(--dash-border)', color: 'var(--dash-subtle)', background: 'transparent' }}
                  >
                    <Icon className="h-3 w-3" />
                    {t.label}
                  </button>
                )
              })}
            </div>
          </div>

          {/* ── Main content area ── */}
          <div key={tab} className="dash-rise animate-[fade-in_0.4s_ease-out] max-w-6xl mx-auto">

            {/* MISSION / ORCHESTRATE */}
            {tab === 'orchestrate' && (
              <div className="grid gap-4 lg:grid-cols-[220px_1fr_260px]">
                <div className="hidden lg:block"><SquadSidebar /></div>
                <Orchestration active={visible} />
                <div className="hidden lg:block"><LiveFeed /></div>
              </div>
            )}

            {/* SQUAD */}
            {tab === 'squad' && (
              <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
                <SquadDashboard pulse={squadPulse} />
                <div className="hidden lg:block"><LiveFeed /></div>
              </div>
            )}

            {/* 100+ SKILLS */}
            {tab === 'skills' && (
              <SkillsShowcase selected={selectedCat} onSelect={setSelectedCat} />
            )}

            {/* DELIVERY */}
            {tab === 'delivery' && (
              <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
                <DeliveryDemo activeIdx={deliveryIdx} />
                <div className="hidden lg:block"><LiveFeed /></div>
              </div>
            )}

            {/* VAULT */}
            {tab === 'vault' && (
              <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
                <VaultDemo />
                <div className="hidden lg:block"><SquadSidebar /></div>
              </div>
            )}

            {/* SCENE AGENTS */}
            {isSceneTab && scene && (
              <div className="grid gap-4 lg:grid-cols-[1.8fr_1fr]">
                <ScenePlayer scene={scene} active={visible} />
                <div className="hidden lg:flex flex-col gap-4">
                  <LiveFeed />
                </div>
              </div>
            )}
          </div>

          {/* CTA strip */}
          <div className="mt-8 flex flex-col items-center gap-3 border-t border-[var(--dash-border)] pt-6">
            <p className="text-[13px] text-[var(--dash-muted)]">
              This is sample data. Your squad runs on your private vault.
            </p>
            <Link
              href="/sign-up"
              className="inline-flex items-center gap-2 rounded-xl px-6 py-3 text-sm font-semibold text-white transition-all duration-300 hover:-translate-y-0.5"
              style={{
                background: `linear-gradient(135deg, ${activeColor}, color-mix(in srgb, ${activeColor} 70%, #7c3aed))`,
                boxShadow: `0 12px 32px -8px ${activeColor}55`,
              }}
            >
              Build your own squad — free
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>

          <style>{`
            .sb-dashboard-clean { background: transparent !important; border: none !important; box-shadow: none !important; }
            .sb-dashboard-clean::before, .sb-dashboard-clean::after { display: none !important; }
          `}</style>
        </div>
      </div>
    </section>
  )
}

// ── Squad Sidebar ───────────────────────────────────────────────────────────────
function SquadSidebar() {
  return (
    <div className="dash-panel dash-panel-strong dash-grain p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between mb-1">
        <h4 className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--dash-text-strong)]">Your Squad</h4>
        <span className="flex items-center gap-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 text-[9px] text-emerald-400 font-medium">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
          3 active
        </span>
      </div>
      {SQUAD.map(agent => {
        const Icon = agent.icon
        const isActive = agent.status === 'active'
        return (
          <div
            key={agent.name}
            className="flex items-center gap-2.5 rounded-xl border p-2.5 transition-all duration-300"
            style={{
              borderColor: isActive ? `${agent.accent}44` : 'var(--dash-border)',
              background: isActive ? `${agent.accent}0a` : 'var(--dash-card-solid)',
            }}
          >
            <span className="relative grid h-8 w-8 shrink-0 place-items-center rounded-lg border"
              style={{ borderColor: `${agent.accent}55`, background: `${agent.accent}18`, color: agent.accent }}>
              <Icon className="h-4 w-4" />
              {isActive && (
                <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-emerald-400 border border-[var(--dash-bg)]" />
              )}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[12px] font-semibold truncate" style={{ color: isActive ? 'var(--dash-text-strong)' : 'var(--dash-text)' }}>
                {agent.name}
              </p>
              <p className="text-[10px] truncate" style={{ color: isActive ? agent.accent : 'var(--dash-muted)' }}>
                {isActive ? agent.task : agent.task}
              </p>
            </div>
            {isActive && <Loader2 className="h-3 w-3 shrink-0 animate-spin" style={{ color: agent.accent }} />}
          </div>
        )
      })}
    </div>
  )
}

// ── Live Feed ───────────────────────────────────────────────────────────────────
function LiveFeed() {
  return (
    <div className="dash-panel dash-panel-strong dash-grain p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between mb-1">
        <h4 className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--dash-text-strong)]">Live Feed</h4>
        <span className="flex items-center gap-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 text-[9px] text-emerald-400 font-medium">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
          Live
        </span>
      </div>
      {VAULT_FEED.map((item, i) => {
        const Icon = item.icon
        return (
          <div key={i} className="flex items-start gap-2.5 rounded-xl border border-[var(--dash-border)] p-2.5 hover:border-[var(--dash-border-bright)] transition-colors duration-200">
            <span className="grid h-6 w-6 shrink-0 place-items-center rounded-md border mt-0.5"
              style={{ borderColor: `${item.accent}44`, background: `${item.accent}14`, color: item.accent }}>
              <Icon className="h-3 w-3" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 mb-0.5">
                <span className="text-[9px] font-bold tracking-wider" style={{ color: item.accent }}>{item.type}</span>
              </div>
              <p className="text-[11.5px] font-medium text-[var(--dash-text)] leading-tight truncate">{item.label}</p>
              <p className="text-[10px] text-[var(--dash-muted)] mt-0.5">{item.time}</p>
            </div>
          </div>
        )
      })}
      <div className="mt-auto grid grid-cols-2 gap-2 pt-2 border-t border-[var(--dash-border)]">
        <div className="rounded-xl bg-[var(--dash-card-solid)] border border-[var(--dash-border)] p-2.5 text-center">
          <span className="block text-[9px] uppercase tracking-wider text-[var(--dash-muted)] font-semibold">Vault-cited</span>
          <strong className="block text-sm font-semibold text-[var(--dash-text-strong)] mt-0.5">100%</strong>
        </div>
        <div className="rounded-xl bg-[var(--dash-card-solid)] border border-[var(--dash-border)] p-2.5 text-center">
          <span className="block text-[9px] uppercase tracking-wider text-[var(--dash-muted)] font-semibold">Private</span>
          <strong className="block text-sm font-semibold text-emerald-400 mt-0.5">Non-shared</strong>
        </div>
      </div>
    </div>
  )
}

// ── Squad Dashboard ────────────────────────────────────────────────
function SquadDashboard({ pulse }: { pulse: number }) {
  return (
    <div className="dash-panel dash-panel-strong dash-grain p-4 md:p-5">
      <div className="flex items-center justify-between mb-3 md:mb-5">
        <div>
          <h3 className="text-sm font-semibold text-[var(--dash-text-strong)]">Jordan's Squad</h3>
          <p className="text-[11px] text-[var(--dash-muted)] mt-0.5">5 agents · 3 active right now</p>
        </div>
        <span className="flex items-center gap-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1 text-[10px] text-emerald-400 font-medium">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
          <span className="hidden sm:inline">All agents running</span>
          <span className="sm:hidden">3 Running</span>
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 md:gap-3">
        {SQUAD.map((agent, i) => {
          const Icon = agent.icon
          const isActive = agent.status === 'active'
          const isPulse = pulse === i
          return (
            <div
              key={agent.name}
              className="rounded-xl border p-3 md:p-4 transition-all duration-500"
              style={{
                borderColor: isPulse ? `${agent.accent}77` : isActive ? `${agent.accent}33` : 'var(--dash-border)',
                background: isPulse ? `${agent.accent}12` : isActive ? `${agent.accent}08` : 'var(--dash-card-solid)',
                boxShadow: isPulse ? `0 0 24px -8px ${agent.accent}44` : 'none',
              }}
            >
              <div className="flex items-center gap-2.5">
                <span className="relative grid h-8 w-8 md:h-10 md:w-10 shrink-0 place-items-center rounded-xl border"
                  style={{ borderColor: `${agent.accent}55`, background: `${agent.accent}18`, color: agent.accent }}>
                  <Icon className="h-4 w-4 md:h-5 md:w-5" />
                  {isActive && (
                    <span className="absolute -top-1 -right-1 h-2 w-2 md:h-2.5 md:w-2.5 rounded-full bg-emerald-400 border-2 border-[var(--dash-bg)]" />
                  )}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <p className="text-[12px] md:text-[13px] font-semibold text-[var(--dash-text-strong)] truncate">{agent.name}</p>
                    <span className="text-[8px] font-bold uppercase tracking-wider rounded-full px-1.5 py-0.5 shrink-0"
                      style={{ color: agent.accent, background: `${agent.accent}18` }}>
                      {agent.role}
                    </span>
                  </div>
                  <p className="text-[10px] md:text-[11px] mt-0.5 truncate" style={{ color: isActive ? agent.accent : 'var(--dash-muted)' }}>
                    {agent.task}
                  </p>
                </div>
                {isActive ? (
                  <Loader2 className="h-3 w-3 shrink-0 animate-spin text-emerald-400" />
                ) : (
                  <Clock className="h-3 w-3 shrink-0 text-[var(--dash-muted)]" />
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Squad Packs */}
      <div className="mt-4 rounded-xl border border-[var(--dash-border)] p-3.5" style={{ background: 'var(--dash-card-solid)' }}>
        <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--dash-muted)] mb-2">Squad Packs</p>
        <div className="flex flex-wrap gap-1.5">
          {['The Brain Trust', 'Research Desk', 'The Watchtower', 'Sales Force'].map(pack => (
            <span key={pack} className="rounded-full border border-[var(--dash-border)] px-2.5 py-1 text-[11px] text-[var(--dash-text)]">
              {pack}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Skills Showcase ─────────────────────────────────────────────────────────────
function SkillsShowcase({ selected, onSelect }: { selected: number; onSelect: (i: number) => void }) {
  const [view, setView] = useState<'library' | 'build' | 'agent'>('library')
  const cat = SKILL_CATEGORIES[selected]

  // Custom Skill Builder State
  const [step, setStep] = useState(0)
  const [customSkill, setCustomSkill] = useState({
    name: 'Monthly Investor Digest',
    purpose: 'Summarize vault decisions, progress, and risks for my investors in plain English.',
    trigger: 'Schedule: 1st of every month at 8 AM',
    agent: 'Sage (Synthesist)',
    delivery: 'Email + save to vault'
  })
  const [customSkillsList, setCustomSkillsList] = useState<string[]>([])
  const [isBuilding, setIsBuilding] = useState(false)

  // Simulation logic for builder
  useEffect(() => {
    if (view !== 'build') return
    const interval = setInterval(() => {
      setStep(s => {
        if (s < BUILDER_STEPS.length - 1) {
          return s + 1
        }
        return 0
      })
    }, 4000)
    return () => clearInterval(interval)
  }, [view])

  const handleCreateSkill = () => {
    setIsBuilding(true)
    setTimeout(() => {
      setCustomSkillsList(prev => [...prev, customSkill.name])
      setIsBuilding(false)
      alert(`Custom Skill "${customSkill.name}" created successfully and deployed to Sage!`)
      setView('library')
    }, 1500)
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Sub tabs to switch between Library, Builder, and Agent proposals */}
      <div className="flex justify-center gap-2 p-1.5 rounded-2xl bg-[var(--dash-card-solid)] border border-[var(--dash-border)] max-w-lg mx-auto w-full">
        <button
          onClick={() => setView('library')}
          className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold transition duration-200"
          style={view === 'library'
            ? { background: 'var(--dash-border-bright)', color: 'var(--dash-text-strong)' }
            : { color: 'var(--dash-muted)' }}
        >
          <Sparkles className="h-3.5 w-3.5 text-orange-400" />
          Skill Library
        </button>
        <button
          onClick={() => setView('build')}
          className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold transition duration-200"
          style={view === 'build'
            ? { background: 'var(--dash-border-bright)', color: 'var(--dash-text-strong)' }
            : { color: 'var(--dash-muted)' }}
        >
          <Wand2 className="h-3.5 w-3.5 text-indigo-400" />
          Custom Builder
        </button>
        <button
          onClick={() => setView('agent')}
          className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold transition duration-200"
          style={view === 'agent'
            ? { background: 'var(--dash-border-bright)', color: 'var(--dash-text-strong)' }
            : { color: 'var(--dash-muted)' }}
        >
          <Bot className="h-3.5 w-3.5 text-sky-400" />
          Agent Proposals
        </button>
      </div>

      {/* Main panel based on selected sub-tab */}
      {view === 'library' && (
        <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
          {/* Category list */}
          <div className="dash-panel dash-panel-strong dash-grain p-4">
            <div className="flex items-center justify-between mb-4">
              <h4 className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--dash-text-strong)]">Skill Categories</h4>
              <span className="text-[10px] font-bold text-[var(--dash-accent)] rounded-full border border-[var(--dash-border)] px-2 py-0.5">100+</span>
            </div>
            <div className="space-y-1.5">
              {SKILL_CATEGORIES.map((c, i) => (
                <button
                  key={c.name}
                  onClick={() => onSelect(i)}
                  className="w-full flex items-center justify-between rounded-xl border px-3 py-2.5 text-left transition-all duration-200"
                  style={i === selected
                    ? { borderColor: `${c.accent}66`, background: `${c.accent}14`, color: c.accent }
                    : { borderColor: 'transparent', color: 'var(--dash-text)', background: 'transparent' }}
                >
                  <span className="text-[13px] font-medium">{c.name}</span>
                  <span className="text-[10px] font-bold rounded-full px-1.5 py-0.5"
                    style={{ color: c.accent, background: `${c.accent}18` }}>
                    {c.count}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Skills grid */}
          <div className="dash-panel dash-panel-strong dash-grain p-5">
            <div className="flex items-center gap-3 mb-5">
              <div className="grid h-10 w-10 place-items-center rounded-xl border"
                style={{ borderColor: `${cat.accent}55`, background: `${cat.accent}14`, color: cat.accent }}>
                <Sparkles className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-[var(--dash-text-strong)]">{cat.name} Skills</h3>
                <p className="text-[11px] text-[var(--dash-muted)]">{cat.count} specialist skills — all vault-grounded, all cited</p>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {cat.skills.map((skill, i) => (
                <div
                  key={skill}
                  className="flex items-center gap-2.5 rounded-xl border p-3 transition-all duration-200 hover:border-[var(--dash-border-bright)] cursor-pointer"
                  style={{ borderColor: 'var(--dash-border)', background: 'var(--dash-card-solid)' }}
                >
                  <CheckCircle2 className="h-4 w-4 shrink-0" style={{ color: cat.accent }} />
                  <span className="text-[12.5px] font-medium text-[var(--dash-text)]">{skill}</span>
                </div>
              ))}
              {/* User created custom skills displayed dynamically */}
              {customSkillsList.map((skill) => (
                <div
                  key={skill}
                  className="flex items-center justify-between gap-2.5 rounded-xl border p-3 transition-all duration-200 border-indigo-500/30 bg-indigo-500/5 hover:border-indigo-500/50 cursor-pointer"
                >
                  <div className="flex items-center gap-2.5">
                    <Wand2 className="h-4 w-4 text-indigo-400 shrink-0" />
                    <span className="text-[12.5px] font-medium text-[var(--dash-text-strong)]">{skill}</span>
                  </div>
                  <span className="text-[9px] font-bold uppercase tracking-wider text-indigo-400 bg-indigo-500/10 rounded-full px-2 py-0.5">CUSTOM</span>
                </div>
              ))}
            </div>
            <div className="mt-5 rounded-xl border p-3.5" style={{ borderColor: `${cat.accent}33`, background: `${cat.accent}08` }}>
              <p className="text-[12px] text-[var(--dash-text)]">
                <strong style={{ color: cat.accent }}>Equip any agent</strong> with any skill. Assign to a schedule. Results land cited in your vault — or delivered to Telegram, Discord, or email.
              </p>
            </div>
          </div>
        </div>
      )}

      {view === 'build' && (
        <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
          {/* Builder Sidebar - Steps explanation */}
          <div className="dash-panel dash-panel-strong dash-grain p-4 flex flex-col justify-between">
            <div>
              <h4 className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--dash-text-strong)] mb-4">Custom Skill Builder</h4>
              <p className="text-xs text-[var(--dash-muted)] leading-relaxed mb-4">
                Define what resources your squad can fetch, how they process the data, and where they deliver results.
              </p>
              <div className="space-y-3">
                {BUILDER_STEPS.map((s, idx) => {
                  const Icon = s.icon
                  const isActive = step === idx
                  return (
                    <div key={idx} className="flex items-center gap-3 transition-all duration-300" style={{ opacity: isActive ? 1 : 0.4 }}>
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold"
                        style={{ background: isActive ? s.color : 'var(--dash-border)', color: isActive ? '#000' : 'var(--dash-muted)' }}>
                        {idx + 1}
                      </span>
                      <div className="min-w-0">
                        <p className="text-[11px] font-semibold text-[var(--dash-text-strong)] truncate">{s.label}</p>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
            <div className="mt-4 pt-3 border-t border-[var(--dash-border)]">
              <span className="text-[10px] text-[var(--dash-muted)]">Agents can also suggest and wire up custom skills based on patterns they find in your vault.</span>
            </div>
          </div>

          {/* Builder Interactive Mockup Panel */}
          <div className="dash-panel dash-panel-strong dash-grain p-5">
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-3">
                <div className="grid h-10 w-10 place-items-center rounded-xl border border-indigo-500/30 bg-indigo-500/10 text-indigo-400">
                  <Wand2 className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-[var(--dash-text-strong)]">Skill Creator</h3>
                  <p className="text-[11px] text-[var(--dash-muted)]">Configure prompts, schedules, and custom connections</p>
                </div>
              </div>
              <span className="rounded-full bg-indigo-500/10 border border-indigo-500/20 px-2.5 py-0.5 text-[9px] text-indigo-400 font-semibold tracking-wider">BUILD MODE</span>
            </div>

            <div className="space-y-4">
              {/* Step 1: Name */}
              <div className="rounded-xl border border-[var(--dash-border)] bg-[var(--dash-card-solid)] p-3">
                <label className="block text-[10px] font-bold uppercase tracking-wider text-[var(--dash-muted)] mb-1.5">Skill Name</label>
                <input
                  type="text"
                  value={customSkill.name}
                  onChange={(e) => setCustomSkill(prev => ({ ...prev, name: e.target.value }))}
                  className="w-full bg-[var(--dash-bg)] border border-[var(--dash-border)] rounded-lg px-3 py-1.5 text-xs text-[var(--dash-text-strong)] focus:outline-none focus:border-indigo-500"
                />
              </div>

              {/* Step 2: Purpose */}
              <div className="rounded-xl border border-[var(--dash-border)] bg-[var(--dash-card-solid)] p-3">
                <label className="block text-[10px] font-bold uppercase tracking-wider text-[var(--dash-muted)] mb-1.5">Purpose / Goal</label>
                <textarea
                  value={customSkill.purpose}
                  onChange={(e) => setCustomSkill(prev => ({ ...prev, purpose: e.target.value }))}
                  rows={2}
                  className="w-full bg-[var(--dash-bg)] border border-[var(--dash-border)] rounded-lg px-3 py-1.5 text-xs text-[var(--dash-text-strong)] focus:outline-none focus:border-indigo-500 resize-none"
                />
              </div>

              {/* Grid for parameters */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="rounded-xl border border-[var(--dash-border)] bg-[var(--dash-card-solid)] p-3">
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-[var(--dash-muted)] mb-1">Trigger / Schedule</label>
                  <input
                    type="text"
                    value={customSkill.trigger}
                    onChange={(e) => setCustomSkill(prev => ({ ...prev, trigger: e.target.value }))}
                    className="w-full bg-[var(--dash-bg)] border border-[var(--dash-border)] rounded-lg px-2 py-1 text-xs text-[var(--dash-text)] focus:outline-none"
                  />
                </div>
                <div className="rounded-xl border border-[var(--dash-border)] bg-[var(--dash-card-solid)] p-3">
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-[var(--dash-muted)] mb-1">Assignee Agent</label>
                  <select
                    value={customSkill.agent}
                    onChange={(e) => setCustomSkill(prev => ({ ...prev, agent: e.target.value }))}
                    className="w-full bg-[var(--dash-bg)] border border-[var(--dash-border)] rounded-lg px-2 py-1 text-xs text-[var(--dash-text)] focus:outline-none"
                  >
                    <option value="Sage (Synthesist)">Sage (Synthesist)</option>
                    <option value="Ranger (Scout)">Ranger (Scout)</option>
                    <option value="Sentinel (Critic)">Sentinel (Critic)</option>
                  </select>
                </div>
                <div className="rounded-xl border border-[var(--dash-border)] bg-[var(--dash-card-solid)] p-3">
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-[var(--dash-muted)] mb-1">Delivery Channel</label>
                  <input
                    type="text"
                    value={customSkill.delivery}
                    onChange={(e) => setCustomSkill(prev => ({ ...prev, delivery: e.target.value }))}
                    className="w-full bg-[var(--dash-bg)] border border-[var(--dash-border)] rounded-lg px-2 py-1 text-xs text-[var(--dash-text)] focus:outline-none"
                  />
                </div>
              </div>
            </div>

            <div className="mt-5 flex items-center justify-between pt-4 border-t border-[var(--dash-border)]">
              <span className="text-[11px] text-[var(--dash-muted)]">All custom skills automatically adhere to private data containment protocols.</span>
              <button
                onClick={handleCreateSkill}
                disabled={isBuilding}
                className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-500 hover:bg-indigo-600 disabled:opacity-50 text-white font-semibold text-xs px-4 py-2 transition-all duration-200"
              >
                {isBuilding ? (
                  <>
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Wiring Skill...
                  </>
                ) : (
                  <>
                    <Plus className="h-3 w-3" />
                    Build & Deploy Skill
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {view === 'agent' && (
        <div className="dash-panel dash-panel-strong dash-grain p-5">
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-3">
              <div className="grid h-10 w-10 place-items-center rounded-xl border border-sky-500/30 bg-sky-500/10 text-sky-400">
                <Bot className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-[var(--dash-text-strong)]">Agent-Proposed Skills</h3>
                <p className="text-[11px] text-[var(--dash-muted)]">Autonomous skills designed by agents to plug gaps detected in your vault</p>
              </div>
            </div>
            <span className="flex items-center gap-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 text-[9px] text-emerald-400 font-medium">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Scanning
            </span>
          </div>

          <div className="space-y-4">
            {AGENT_PROPOSED_SKILLS.map((proposal) => (
              <div
                key={proposal.skillName}
                className="rounded-xl border border-[var(--dash-border)] bg-[var(--dash-card-solid)] p-4 hover:border-[var(--dash-border-bright)] transition-colors duration-200"
              >
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div className="flex items-center gap-2">
                    <span className="flex h-5 w-5 items-center justify-center rounded-md text-[9px] font-bold uppercase tracking-wider"
                      style={{ background: `${proposal.agentAccent}15`, color: proposal.agentAccent, border: `1px solid ${proposal.agentAccent}33` }}>
                      {proposal.agent[0]}
                    </span>
                    <div>
                      <h4 className="text-xs font-semibold text-[var(--dash-text-strong)]">{proposal.skillName}</h4>
                      <p className="text-[10px] text-[var(--dash-muted)] mt-0.5">Proposed by {proposal.agent} for {proposal.category}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="text-xs font-bold text-emerald-400">{proposal.confidence}%</span>
                    <p className="text-[9px] text-[var(--dash-muted)]">Match confidence</p>
                  </div>
                </div>

                <p className="text-xs text-[var(--dash-text)] leading-relaxed mb-3">{proposal.reason}</p>

                <div className="flex items-center justify-between pt-2 border-t border-[var(--dash-border)]">
                  <span className="text-[9.5px] font-mono text-amber-500/90 bg-amber-500/5 border border-amber-500/10 rounded px-1.5 py-0.5">
                    Trigger: {proposal.trigger}
                  </span>
                  <button
                    onClick={() => {
                      setCustomSkillsList(prev => [...prev, proposal.skillName])
                      alert(`Approved and deployed "${proposal.skillName}" to ${proposal.agent}!`)
                    }}
                    className="inline-flex items-center gap-1 rounded-lg bg-[var(--dash-border-bright)] hover:bg-[var(--dash-border-bright)]/80 text-[11px] font-semibold px-2.5 py-1 transition-all duration-200 text-[var(--dash-text-strong)]"
                  >
                    <Plus className="h-3 w-3 text-emerald-400" />
                    Approve & Deploy
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Delivery Demo ───────────────────────────────────────────────────────────────
function DeliveryDemo({ activeIdx }: { activeIdx: number }) {
  const [typing, setTyping] = useState(false)
  const active = DELIVERY_LOG[activeIdx]

  useEffect(() => {
    setTyping(true)
    const t = setTimeout(() => setTyping(false), 1200)
    return () => clearTimeout(t)
  }, [activeIdx])

  return (
    <div className="dash-panel dash-panel-strong dash-grain p-5">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h3 className="text-sm font-semibold text-[var(--dash-text-strong)]">Agent Delivery</h3>
          <p className="text-[11px] text-[var(--dash-muted)] mt-0.5">Results land where you work — no app-switching</p>
        </div>
      </div>

      {/* Channel tabs */}
      <div className="flex gap-2 mb-5">
        {DELIVERY_LOG.map((d, i) => {
          const Icon = d.icon
          return (
            <div
              key={d.channel}
              className="flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[12px] font-medium transition-all duration-300"
              style={i === activeIdx
                ? { borderColor: `${d.accent}66`, background: `${d.accent}14`, color: d.accent }
                : { borderColor: 'var(--dash-border)', color: 'var(--dash-muted)', background: 'var(--dash-card-solid)' }}
            >
              <Icon className="h-3.5 w-3.5" />
              {d.channel}
            </div>
          )
        })}
      </div>

      {/* Mock phone / message preview */}
      <div
        className="rounded-2xl border p-5 transition-all duration-500"
        style={{ borderColor: `${active.accent}44`, background: `${active.accent}08` }}
      >
        <div className="flex items-center gap-3 mb-4">
          <div className="grid h-10 w-10 place-items-center rounded-xl border"
            style={{ borderColor: `${active.accent}55`, background: `${active.accent}18`, color: active.accent }}>
            <active.icon className="h-5 w-5" />
          </div>
          <div>
            <p className="text-[13px] font-semibold text-[var(--dash-text-strong)]">{active.channel}</p>
            <p className="text-[11px] text-[var(--dash-muted)]">from {active.agent} · {active.time}</p>
          </div>
          {active.sent ? (
            <span className="ml-auto flex items-center gap-1 text-[10px] text-emerald-400 font-medium">
              <CheckCircle2 className="h-3.5 w-3.5" /> Delivered
            </span>
          ) : (
            <span className="ml-auto flex items-center gap-1 text-[10px] text-[var(--dash-muted)]">
              <Clock className="h-3.5 w-3.5" /> Scheduled
            </span>
          )}
        </div>

        <div className="rounded-xl border border-[var(--dash-border)] bg-[var(--dash-card-strong)] p-4">
          {typing ? (
            <div className="flex items-center gap-2 text-[12px] text-[var(--dash-muted)]">
              <Loader2 className="h-3.5 w-3.5 animate-spin" style={{ color: active.accent }} />
              Agent composing message…
            </div>
          ) : (
            <p className="text-[13px] leading-relaxed text-[var(--dash-text)]">{active.message}</p>
          )}
        </div>

        <p className="mt-3 text-[11px] text-[var(--dash-muted)]">
          Every message is vault-grounded. No guesses, no hallucinations — your agent cites its sources.
        </p>
      </div>

      {/* Channels grid */}
      <div className="mt-5 grid grid-cols-2 sm:grid-cols-4 gap-2">
        {[
          { name: 'Telegram', icon: Smartphone, accent: '#38bdf8' },
          { name: 'Discord', icon: MessageCircle, accent: '#a78bfa' },
          { name: 'WhatsApp', icon: Smartphone, accent: '#34d399' },
          { name: 'Email', icon: Send, accent: '#fb923c' },
        ].map(ch => {
          const Icon = ch.icon
          return (
            <div key={ch.name} className="rounded-xl border border-[var(--dash-border)] p-3 text-center" style={{ background: 'var(--dash-card-solid)' }}>
              <Icon className="h-4 w-4 mx-auto mb-1" style={{ color: ch.accent }} />
              <p className="text-[11px] font-medium text-[var(--dash-text)]">{ch.name}</p>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Vault Demo ──────────────────────────────────────────────────────────────────
function VaultDemo() {
  return (
    <div className="dash-panel dash-panel-strong dash-grain p-5">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h3 className="text-sm font-semibold text-[var(--dash-text-strong)]">Jordan's Vault · Acme Research</h3>
          <p className="text-[11px] text-[var(--dash-muted)] mt-0.5">342 sources · 1,280 notes · 96 topics · self-wiring graph</p>
        </div>
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-emerald-400" />
          <span className="text-[10px] text-emerald-400 font-medium">Encrypted · Private</span>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-4 gap-2 mb-5">
        {[
          { label: 'Sources', val: '342', delta: '+18', accent: '#a78bfa' },
          { label: 'Decisions', val: '51', delta: '+4', accent: '#fb923c' },
          { label: 'Agents', val: '5', delta: 'active', accent: '#38bdf8' },
          { label: 'Citations', val: '2.1k', delta: '100%', accent: '#34d399' },
        ].map(s => (
          <div key={s.label} className="rounded-xl border border-[var(--dash-border)] p-3 text-center" style={{ background: 'var(--dash-card-solid)' }}>
            <strong className="block text-base font-semibold" style={{ color: s.accent }}>{s.val}</strong>
            <span className="block text-[9px] uppercase tracking-wider text-[var(--dash-muted)] mt-0.5">{s.label}</span>
            <span className="block text-[9px] text-emerald-400 mt-0.5">{s.delta}</span>
          </div>
        ))}
      </div>

      {/* Recent memory pages */}
      <h4 className="text-[10px] font-bold uppercase tracking-wider text-[var(--dash-muted)] mb-2.5">Recent Memory Pages</h4>
      <div className="space-y-2">
        {[
          { title: 'Northwind Renewal Prep', tags: ['deal', 'CRM'], confidence: 72, accent: '#ff7a1f', agent: 'Sage' },
          { title: 'EU Market Scan', tags: ['market', 'competitors', 'EU'], confidence: 89, accent: '#38bdf8', agent: 'Ranger' },
          { title: 'Beta Co. Churn Risk', tags: ['decision', 'risk'], confidence: 91, accent: '#a78bfa', agent: 'Sentinel' },
          { title: 'Pricing Page Impact Analysis', tags: ['ops', 'signups'], confidence: 68, accent: '#34d399', agent: 'Sherlock' },
        ].map(page => (
          <div key={page.title} className="flex items-start gap-3 rounded-xl border border-[var(--dash-border)] p-3 hover:border-[var(--dash-border-bright)] transition-colors"
            style={{ background: 'var(--dash-card-solid)' }}>
            <Brain className="h-4 w-4 mt-0.5 shrink-0" style={{ color: page.accent }} />
            <div className="flex-1 min-w-0">
              <p className="text-[12.5px] font-semibold text-[var(--dash-text-strong)] truncate">{page.title}</p>
              <div className="flex flex-wrap gap-1 mt-1">
                {page.tags.map(t => (
                  <span key={t} className="rounded-full border border-[var(--dash-border)] px-1.5 py-0.5 text-[9px] text-[var(--dash-muted)]">{t}</span>
                ))}
              </div>
            </div>
            <div className="text-right shrink-0">
              <span className="block text-[10px] font-bold" style={{ color: page.accent }}>{page.confidence}%</span>
              <span className="block text-[9px] text-[var(--dash-muted)]">confidence</span>
              <span className="block text-[9px] text-[var(--dash-muted)] mt-0.5">by {page.agent}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-4 rounded-xl border p-3" style={{ borderColor: '#60a5fa33', background: '#60a5fa08' }}>
        <p className="text-[12px] text-[var(--dash-text)]">
          <strong className="text-[var(--dash-text-strong)]">Every page is agent-readable.</strong> Your squad searches, synthesizes, and writes back to this vault — with your approval. No page is ever deleted without your sign-off.
        </p>
      </div>
    </div>
  )
}
