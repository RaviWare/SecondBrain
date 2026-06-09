'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import Script from 'next/script'
import { Ticker } from '@/components/ticker'
import { SiteFooter } from '@/components/footer/SiteFooter'
import { Testimonials } from '@/components/testimonials/Testimonials'
import { PrecisionGrid } from '@/components/features/PrecisionGrid'
import { Hero } from '@/components/hero/Hero'
import { AgentShowcase } from '@/components/demo/AgentShowcase'
import { VaultAnatomyInteractive } from '@/components/features/VaultAnatomyInteractive'
import { BrainMark } from '@/components/ui/BrainMark'
import { ThemeToggle } from '@/components/theme/ThemeToggle'
import { Shield, Bot, Network, Database, Inbox, GitBranch, Zap, Briefcase, BookOpen, Pen, Layers, MessageSquare, Lock, FileText, CheckCircle2, MessageCircle, Terminal, ChevronRight, Loader2, Plus } from 'lucide-react'
import { useSpotlight } from '@/lib/use-spotlight'

const SITE_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
const NAV_LINKS = [
  { label: 'Features', href: '#features' },
  { label: 'How it works', href: '#how-it-works' },
  { label: 'Use cases', href: '#use-cases' },
  { label: 'Pricing', href: '#pricing' },
  { label: 'FAQ', href: '#faq' },
]

const STEPS = [
  { num: '01', icon: Inbox, title: 'Build your vault', desc: 'Drop in URLs, PDFs, transcripts, notes, and DOCX files. Every source becomes a cited memory page — with summaries, entities, decisions, and provenance, automatically.' },
  { num: '02', icon: GitBranch, title: 'Assemble your squad', desc: 'Name your agents, assign their roles, and equip them from a library of 100+ specialized skills — research, sales, ops, content, finance, and more. Your squad, built for your business.' },
  { num: '03', icon: Zap, title: 'One ask. They run.', desc: 'Set a goal. Your lead agent decomposes it into a task graph, specialist sub-agents execute, and results land cited in your vault — or straight to your Telegram.' },
]

const PRINCIPLES = [
  {
    icon: Shield,
    label: 'Private Vault',
    title: 'The brain your squad actually knows',
    desc: 'Your agents don\'t guess from the internet — they work from your private vault. Every source, decision, and note your squad uses is yours, encrypted, isolated, and never used to train any AI model.',
  },
  {
    icon: Zap,
    label: 'Named Squad Agents',
    title: 'Name them. Brief them. Deploy them.',
    desc: 'Pick from 7 agent archetypes — Scout, Synthesist, Critic, Librarian, Researcher, and more. Give them names, assign roles, equip them from 100+ skills, and set their schedule. Your squad, not a generic bot.',
  },
  {
    icon: MessageSquare,
    label: 'Mission Orchestrator',
    title: 'One objective. A squad handles the rest.',
    desc: 'Hand off a big goal and your lead agent decomposes it into a task graph. Specialist sub-agents execute in parallel with a plan you approve first. Budget-capped, kill-switch included.',
  },
  {
    icon: Network,
    label: 'Cited & Delivered',
    title: 'Results in your inbox. Every claim sourced.',
    desc: 'Every answer, briefing, and output traces back to your own vault pages — never a confident guess. Agents deliver to Telegram, Discord, WhatsApp, or email so results reach you where you work.',
  },
]

const CAPABILITIES = [
  ['Ingest URLs, PDFs, DOCX, transcripts, and notes — source trail and provenance preserved', 'Source intake'],
  ['Auto-summaries, entities, decisions, and self-wiring links generated per source', 'Memory schema'],
  ['7 agent roles, named characters, squad packs, and per-agent sign-off policies', 'Squad system'],
  ['100+ specialist skills across research, sales, ops, content, finance, and planning', 'Skill library'],
  ['Lead agent decomposes objectives into task graphs — sub-agents execute in parallel', 'Mission orchestrator'],
  ['Agent briefings delivered to Telegram, Discord, WhatsApp, or email automatically', 'Messaging delivery'],
  ['Deep semantic search across your entire connected knowledge graph', 'Retrieval'],
  ['Cited answers with honest gap analysis — every claim traced to your vault', 'Answer engine'],
]

const FLOW = [
  {
    code: 'CAPTURE',
    icon: Inbox,
    title: 'Everything in, nothing lost',
    desc: 'URLs, PDFs, transcripts, notes, and DOCX files land in one clean lane. Original context and provenance preserved on every source.',
  },
  {
    code: 'VAULT',
    icon: Database,
    title: 'Structured memory that compounds',
    desc: 'Each source becomes a durable memory page — summaries, entities, decisions, linked concepts, and a full evidence trail.',
  },
  {
    code: 'SQUAD',
    icon: Bot,
    title: 'Build your squad',
    desc: 'Name your agents. Assign archetypes. Equip them with 100+ skills. Set schedules. They run inside your vault — not on generic internet data.',
  },
  {
    code: 'MISSION',
    icon: Network,
    title: 'One ask. Squad executes.',
    desc: 'Drop an objective. Your lead agent decomposes it, specialist sub-agents execute in parallel, results land cited — delivered to Telegram or your inbox.',
  },
]

const VAULT_LAYERS = [
  ['raw sources', 'Immutable evidence inbox'],
  ['source summaries', 'One page per ingested item'],
  ['concepts and entities', 'People, products, ideas, methods'],
  ['patterns and synthesis', 'Cross-source understanding'],
  ['operation log', 'Every ingest and query recorded'],
]

const FAQS = [
  {
    q: 'What is SecondBrain Cloud?',
    a: 'A private AI operating system: a knowledge vault that turns your sources — notes, PDFs, URLs, and transcripts — into cited, connected memory, plus a named squad of always-on AI agents that work that memory for you 24/7. Your agents know your business because they live inside your vault.',
  },
  {
    q: 'How is this different from agent tools like MissionControl or Lindy?',
    a: 'Most agent tools give you a dashboard to watch agents run. SecondBrain gives your agents a brain — your private vault. They don\'t connect to the internet and guess; they work from what you\'ve actually captured and cite every answer back to your own sources. Agents without a brain are just bots.',
  },
  {
    q: 'How is this different from ChatGPT or Notion AI?',
    a: 'ChatGPT does not know your private knowledge and fills gaps with confident guesses. Notion AI bolts AI onto a document editor. SecondBrain is purpose-built for cited recall of your own material, with a squad of named specialist agents that act on it continuously — not just on-demand.',
  },
  {
    q: 'What can the agents actually do?',
    a: 'They run 100+ specialized skills across research, sales, ops, content, finance, and planning — from daily briefings and deal recaps to mission orchestration where a lead agent decomposes a goal and sub-agents execute in parallel. Results are delivered cited to your vault, Telegram, Discord, or email.',
  },
  {
    q: 'Can I name my agents and build a custom squad?',
    a: 'Yes. You pick the archetype (Scout, Synthesist, Critic, Librarian, Researcher, or custom), give them a name (Ranger, Sage, Sentinel, Sherlock — or your own), equip them with skills, and set their schedule. Squad-tier users also get pre-built squad packs like The Brain Trust or The Research Desk.',
  },
  {
    q: 'Do the agents make things up?',
    a: 'No. Every answer is grounded in your vault with source citations. If the brain does not know something, it says so explicitly — honest gap analysis is built in by design. Agents cannot write to your vault without your approval either; every change is a proposal you sign off on.',
  },
  {
    q: 'What can I ingest into SecondBrain?',
    a: 'URLs, plain text, markdown, PDFs, DOCX, and TXT files, plus call transcripts. Drop them in yourself, or let an agent ingest sources for you automatically on a schedule.',
  },
  {
    q: 'What is the Squad tier?',
    a: 'Squad ($99/mo, limited early access) gives you unlimited named autonomous agents, 100+ skills, mission orchestration, agent briefings via Telegram/Discord/WhatsApp, BYO LLM keys (Claude, ChatGPT), a dedicated isolated workspace, and direct founder onboarding. Seats are intentionally capped.',
  },
  {
    q: 'Is my data private and secure?',
    a: 'Yes. Your vault is encrypted, isolated per user, and never used to train any AI model. Agents cannot share your data with third parties, cannot delete pages, and cannot widen their own permissions — these are hard constraints, not settings.',
  },
]

const USE_CASES = [
  {
    icon: Briefcase,
    title: 'Founders & operators',
    desc: 'A Daily Briefing agent preps your morning. A Risk Radar flags decisions gone stale. A Meeting Prep agent pulls every relevant note 10 minutes before the call. Your private chief-of-staff — running 24/7 on your actual context.',
  },
  {
    icon: BookOpen,
    title: 'Researchers & analysts',
    desc: 'Sherlock runs Literature Reviews. Fury hunts new sources. Cipher fact-checks every claim against the vault. A Research Desk squad of four keeps your knowledge current, cross-referenced, and honest about what it doesn\'t yet know.',
  },
  {
    icon: Pen,
    title: 'Creators & writers',
    desc: 'Blog Drafter, Newsletter Builder, Social Repurposer — all grounded only in what you\'ve actually captured. An agent drafts in your voice because it knows your vault, not the internet\'s average.',
  },
  {
    icon: Layers,
    title: 'Product & engineering teams',
    desc: 'Decision Logger captures every architectural choice with rationale. Contradiction Finder flags when specs disagree. Process Mapper reconstructs how things actually work from scattered notes. A living memory layer that never forgets.',
  },
]

function FeatureCard({ p, i, isHighlighted }: { p: typeof PRINCIPLES[0]; i: number; isHighlighted: boolean }) {
  const { ref, onMouseMove } = useSpotlight()
  return (
    <div
      ref={ref}
      onMouseMove={onMouseMove}
      className={`dash-panel dash-grain dash-spotlight dash-interactive relative rounded-2xl p-4 md:p-6 transition-all duration-300 ${
        isHighlighted 
          ? 'active-card -translate-y-[4px] border-[var(--dash-border-glow)] shadow-[var(--dash-shadow-md),0_0_0_1px_var(--dash-border-glow)_inset,0_0_38px_-8px_var(--dash-accent-soft)]' 
          : 'hover:-translate-y-[2px]'
      }`}
      style={{
        animationDelay: `${i * 80}ms`,
        ...(isHighlighted ? {
          '--mx': '50%',
          '--my': '50%',
        } as React.CSSProperties : {})
      }}
    >
      <span 
        className="dash-spotlight-glow" 
        aria-hidden 
        style={isHighlighted ? { opacity: 1 } : undefined}
      />
      
      {/* Decorative Technical SVG Backgrounds */}
      {i === 0 && (
        <div className={`absolute right-[-20px] bottom-[-20px] w-36 h-36 pointer-events-none transition-all duration-500 ${isHighlighted ? 'opacity-25 scale-105' : 'opacity-[0.05] scale-100'}`}>
          <svg viewBox="0 0 100 100" className="w-full h-full text-[var(--dash-accent)]">
            <line x1="10" y1="50" x2="90" y2="50" stroke="currentColor" strokeWidth="0.25" strokeDasharray="2 4" />
            <line x1="50" y1="10" x2="50" y2="90" stroke="currentColor" strokeWidth="0.25" strokeDasharray="2 4" />
            <circle cx="50" cy="50" r="30" fill="none" stroke="currentColor" strokeWidth="0.5" strokeDasharray="4 8" className="card-spin-slow" />
            <circle cx="50" cy="50" r="40" fill="none" stroke="currentColor" strokeWidth="0.25" strokeDasharray="2 2" />
            <path d="M50,30 L68,36 V54 C68,66 50,72 50,72 C50,72 32,66 32,54 V36 Z" fill="none" stroke="currentColor" strokeWidth="1.25" />
            <path d="M50,35 L62,39 V51 C62,60 50,65 50,65 C50,65 38,60 38,51 V39 Z" fill="none" stroke="currentColor" strokeWidth="0.5" strokeDasharray="1 2" className={isHighlighted ? 'card-pulse-fast' : ''} />
          </svg>
        </div>
      )}
      
      {i === 1 && (
        <div className={`absolute right-[-20px] bottom-[-20px] w-36 h-36 pointer-events-none transition-all duration-500 ${isHighlighted ? 'opacity-25 scale-105' : 'opacity-[0.05] scale-100'}`}>
          <svg viewBox="0 0 100 100" className="w-full h-full text-[var(--dash-accent)]">
            <circle cx="50" cy="50" r="42" fill="none" stroke="currentColor" strokeWidth="0.25" strokeDasharray="3 6" />
            <circle cx="50" cy="50" r="32" fill="none" stroke="currentColor" strokeWidth="0.5" className="card-spin-slow" />
            <circle cx="50" cy="50" r="22" fill="none" stroke="currentColor" strokeWidth="0.75" strokeDasharray="8 4" className="card-spin-rev" />
            <line x1="50" y1="50" x2="80" y2="20" stroke="currentColor" strokeWidth="1" strokeLinecap="round" className="card-spin-slow" />
            <circle cx="50" cy="18" r="2.5" fill="currentColor" className="card-spin-slow" />
            <circle cx="50" cy="78" r="2.5" fill="currentColor" className="card-spin-slow" />
            <circle cx="28" cy="50" r="2" fill="currentColor" className="card-spin-rev" />
            <circle cx="72" cy="50" r="2" fill="currentColor" className="card-spin-rev" />
          </svg>
        </div>
      )}

      {i === 2 && (
        <div className={`absolute right-[-20px] bottom-[-20px] w-36 h-36 pointer-events-none transition-all duration-500 ${isHighlighted ? 'opacity-25 scale-105' : 'opacity-[0.05] scale-100'}`}>
          <svg viewBox="0 0 100 100" className="w-full h-full text-[var(--dash-accent)]">
            <rect x="25" y="25" width="50" height="50" rx="4" fill="none" stroke="currentColor" strokeWidth="0.5" strokeDasharray="30 4 10 4 20" />
            <path d="M30,35 H70 M30,45 H55 M30,55 H65" stroke="currentColor" strokeWidth="0.75" strokeLinecap="round" strokeDasharray="2 2" />
            <path d="M60,45 L85,45 M85,45 L85,75" fill="none" stroke="currentColor" strokeWidth="0.5" strokeDasharray="2 4" />
            <circle cx="85" cy="75" r="3" fill="currentColor" className={isHighlighted ? 'card-pulse-fast' : ''} />
            <circle cx="60" cy="45" r="2" fill="currentColor" />
            <path d="M40,55 L20,70" fill="none" stroke="currentColor" strokeWidth="0.5" strokeDasharray="2 2" />
            <circle cx="20" cy="70" r="2.5" fill="none" stroke="currentColor" strokeWidth="0.5" />
          </svg>
        </div>
      )}

      {i === 3 && (
        <div className={`absolute right-[-20px] bottom-[-20px] w-36 h-36 pointer-events-none transition-all duration-500 ${isHighlighted ? 'opacity-25 scale-105' : 'opacity-[0.05] scale-100'}`}>
          <svg viewBox="0 0 100 100" className="w-full h-full text-[var(--dash-accent)]">
            <line x1="50" y1="25" x2="25" y2="60" stroke="currentColor" strokeWidth="0.5" strokeDasharray={isHighlighted ? 'none' : '2 2'} className="transition-all duration-500" />
            <line x1="50" y1="25" x2="75" y2="60" stroke="currentColor" strokeWidth="0.5" strokeDasharray={isHighlighted ? 'none' : '2 2'} className="transition-all duration-500" />
            <line x1="25" y1="60" x2="75" y2="60" stroke="currentColor" strokeWidth="0.5" />
            <line x1="50" y1="25" x2="50" y2="78" stroke="currentColor" strokeWidth="0.75" />
            <line x1="25" y1="60" x2="50" y2="78" stroke="currentColor" strokeWidth="0.5" />
            <line x1="75" y1="60" x2="50" y2="78" stroke="currentColor" strokeWidth="0.5" />
            <circle cx="50" cy="50" r="42" fill="none" stroke="currentColor" strokeWidth="0.25" strokeDasharray="1 8" className="card-spin-slow" />
            <circle cx="50" cy="25" r="3.5" fill="currentColor" />
            <circle cx="25" cy="60" r="3" fill="currentColor" />
            <circle cx="75" cy="60" r="3" fill="currentColor" />
            <circle cx="50" cy="78" r="4" fill="none" stroke="currentColor" strokeWidth="1" />
            <circle cx="50" cy="78" r="1.5" fill="currentColor" className={isHighlighted ? 'card-pulse-fast' : ''} />
          </svg>
        </div>
      )}

      <div className="relative z-[1]">
        <div className="flex items-center justify-between mb-3 md:mb-5">
          <div
            className="w-9 h-9 rounded-xl grid place-items-center"
            style={{
              background: 'color-mix(in srgb, var(--dash-accent) 12%, transparent)',
              border: '1px solid color-mix(in srgb, var(--dash-accent) 22%, transparent)',
            }}
          >
            <p.icon size={17} className="text-[var(--dash-accent)]" />
          </div>
          <p className="mono text-[9px] tracking-widest text-[var(--dash-accent-2)]">
            {p.label.toUpperCase()}
          </p>
        </div>
        <h3 className="text-base md:text-lg font-semibold tracking-tight text-[var(--dash-text-strong)]">
          {p.title}
        </h3>
        <p className="mt-2 text-sm leading-6 md:leading-7 text-[var(--dash-muted)]">
          {p.desc}
        </p>
      </div>

      <style jsx>{`
        @keyframes card-spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes card-spin-reverse {
          from { transform: rotate(360deg); }
          to { transform: rotate(0deg); }
        }
        @keyframes card-pulse {
          0%, 100% { opacity: 0.35; }
          50% { opacity: 0.85; }
        }
        .card-spin-slow {
          transform-origin: center;
          animation: card-spin 35s linear infinite;
        }
        .card-spin-rev {
          transform-origin: center;
          animation: card-spin-reverse 18s linear infinite;
        }
        .card-pulse-fast {
          animation: card-pulse 2s ease-in-out infinite;
        }
        .active-card::after {
          opacity: 1 !important;
        }
      `}</style>
    </div>
  )
}

function FlowCard({ item, i }: { item: typeof FLOW[0]; i: number }) {
  const { ref, onMouseMove } = useSpotlight()
  const Icon = item.icon
  const stepColors = ['#ff7a1f', '#22d3ee', '#a78bfa', '#34d399']
  const stepColor = stepColors[i] || '#ff7a1f'

  // Capture cycle state
  const [captureIdx, setCaptureIdx] = useState(0)
  const files = [
    { name: 'northwind_renewal.pdf', type: 'PDF', color: '#ff7a1f' },
    { name: 'earnings_call.mp3', type: 'AUDIO', color: '#38bdf8' },
    { name: 'competitor_pricing.html', type: 'URL', color: '#a78bfa' },
  ]

  // Mission cycle state
  const [missionState, setMissionState] = useState<'typing' | 'delivered'>('typing')

  useEffect(() => {
    if (i === 0) {
      const interval = setInterval(() => {
        setCaptureIdx(prev => (prev + 1) % files.length)
      }, 4000)
      return () => clearInterval(interval)
    }
  }, [i])

  useEffect(() => {
    if (i === 3) {
      const interval = setInterval(() => {
        setMissionState(prev => (prev === 'typing' ? 'delivered' : 'typing'))
      }, 4000)
      return () => clearInterval(interval)
    }
  }, [i])

  return (
    <div
      ref={ref}
      onMouseMove={onMouseMove}
      className="dash-panel dash-grain dash-spotlight dash-interactive relative rounded-3xl p-5 transition-all duration-300 flow-card border border-[var(--dash-border)] min-h-[430px] flex flex-col justify-between"
      style={{
        animationDelay: `${i * 120}ms`,
      }}
    >
      <span className="dash-spotlight-glow" aria-hidden />

      {/* Background Step Number */}
      <span className="absolute right-4 bottom-2 text-7xl font-bold font-mono opacity-[0.03] select-none pointer-events-none">
        0{i + 1}
      </span>

      <div className="relative z-[1] flex flex-col justify-between h-full flex-1">
        <div className="flex-1 flex flex-col">
          {/* Header row */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div
                className="w-8 h-8 rounded-lg grid place-items-center"
                style={{
                  background: `${stepColor}15`,
                  border: `1px solid ${stepColor}33`,
                  color: stepColor
                }}
              >
                <Icon size={16} />
              </div>
              <span className="mono text-[9.5px] tracking-widest font-bold" style={{ color: stepColor }}>
                {item.code}
              </span>
            </div>
            <span
              className="flow-node"
              style={{
                background: stepColor,
                boxShadow: `0 0 0 4px ${stepColor}15, 0 0 12px ${stepColor}`,
                animationDelay: `${i * 0.4}s`
              }}
            />
          </div>

          <h3 className="text-base md:text-[17px] font-semibold tracking-tight text-[var(--dash-text-strong)]">
            {item.title}
          </h3>
          <p className="mt-2 text-[12px] leading-relaxed text-[var(--dash-muted)] flex-1">
            {item.desc}
          </p>
        </div>

        {/* Dynamic Micro-Visual Mockup Area */}
        <div className="mt-6 rounded-2xl border border-[var(--dash-border)] bg-[var(--dash-card-solid)] h-[120px] overflow-hidden relative p-3 flex flex-col justify-center shrink-0">
          {i === 0 && (
            <div className="flex flex-col gap-1.5 justify-center h-full">
              <div className="flex items-center justify-between text-[9px] text-[var(--dash-muted)] font-mono border-b border-[var(--dash-border)] pb-1 mb-0.5">
                <span>CAPTURE INGEST</span>
                <span className="text-[8px] text-orange-400 font-bold uppercase tracking-wider">Processing</span>
              </div>
              <div key={captureIdx} className="space-y-1.5 animate-[ingest-file_4s_infinite]">
                <div className="flex items-center gap-2 rounded border border-[var(--dash-border)] bg-[var(--dash-bg)] px-2.5 py-1.5 text-[10.5px]">
                  <FileText className="h-4 w-4 shrink-0" style={{ color: files[captureIdx].color }} />
                  <span className="text-[10.5px] truncate text-[var(--dash-text-strong)] font-mono flex-1">{files[captureIdx].name}</span>
                  <span className="text-[8px] uppercase font-bold text-[var(--dash-muted)]">{files[captureIdx].type}</span>
                </div>
                
                {/* Loading Progress Bar */}
                <div className="h-1 w-full bg-[var(--dash-border)] rounded-full overflow-hidden relative">
                  <div className="h-full bg-orange-400 rounded-full animate-[ingest-progress_2s_ease-out_forwards]" />
                </div>
                <div className="flex items-center justify-between text-[8.5px] font-mono text-[var(--dash-muted)]">
                  <span>Vector indexing...</span>
                  <span className="text-emerald-400 flex items-center gap-0.5 animate-[ingest-check_2s_ease-out_forwards]">
                    <CheckCircle2 className="h-2.5 w-2.5" /> Ready
                  </span>
                </div>
              </div>
            </div>
          )}

          {i === 1 && (
            <div className="flex flex-col justify-between h-full">
              <div className="text-[9px] text-[var(--dash-muted)] font-mono border-b border-[var(--dash-border)] pb-1.5 mb-1.5 flex items-center justify-between">
                <span>AUTO-LINKING ENGINE</span>
                <span className="text-[8px] text-sky-400 font-bold tracking-wider animate-pulse">GRAPHING</span>
              </div>
              {/* Source sentence with highlighted terms */}
              <p className="text-[9.5px] text-center font-mono leading-snug py-0.5 text-[var(--dash-text-strong)]">
                Map <span className="text-orange-400 font-semibold underline decoration-orange-400/40">Acme</span> with <span className="text-sky-400 font-semibold underline decoration-sky-400/40">SWOT</span>
              </p>
              {/* Concept nodes */}
              <div className="flex justify-between items-center px-4 mt-2 h-10 relative">
                <div className="h-6 px-2 rounded border border-orange-500/30 bg-orange-500/5 text-orange-400 text-[9px] font-mono grid place-items-center relative z-10 animate-[node-active_3.5s_infinite]">
                  [[Acme]]
                </div>
                {/* SVG Connector path */}
                <div className="absolute inset-0 h-10 pointer-events-none">
                  <svg className="w-full h-full text-sky-500/30" viewBox="0 0 160 40">
                    <path d="M40 0 L40 20" stroke="currentColor" strokeWidth="0.75" strokeDasharray="2 2" className="animate-[draw-connector-line_3.5s_infinite]" />
                    <path d="M120 0 L120 20" stroke="currentColor" strokeWidth="0.75" strokeDasharray="2 2" className="animate-[draw-connector-line_3.5s_infinite]" />
                  </svg>
                </div>
                <div className="h-6 px-2 rounded border border-sky-500/30 bg-sky-500/5 text-sky-400 text-[9px] font-mono grid place-items-center relative z-10 animate-[node-active_3.5s_infinite_0.4s]">
                  [[SWOT]]
                </div>
              </div>
            </div>
          )}

          {i === 2 && (
            <div className="flex flex-col justify-between h-full">
              <div className="text-[9px] text-[var(--dash-muted)] font-mono border-b border-[var(--dash-border)] pb-1.5 mb-1.5 flex items-center justify-between">
                <span>SQUAD DELEGATION</span>
                <span className="text-[8px] text-purple-400 font-bold tracking-wider">ROUTING</span>
              </div>
              <div className="relative h-14 flex items-center justify-center">
                {/* Sage (lead agent) at top center */}
                <div className="absolute top-0 h-6 w-6 rounded-md border border-purple-500/40 bg-purple-500/10 text-purple-400 text-[10px] font-bold grid place-items-center z-10">
                  S
                </div>
                
                {/* SVG Tree connections */}
                <svg className="absolute inset-0 w-full h-full text-[var(--dash-border)]" viewBox="0 0 160 64">
                  <path d="M80 24 L40 48" stroke="currentColor" strokeWidth="0.75" />
                  <path d="M80 24 L120 48" stroke="currentColor" strokeWidth="0.75" />
                  
                  <circle cx="80" cy="24" r="2.5" fill="#a78bfa" className="animate-[travel-left-branch_3.5s_infinite]" />
                  <circle cx="80" cy="24" r="2.5" fill="#a78bfa" className="animate-[travel-right-branch_3.5s_infinite]" />
                </svg>

                {/* Sub agents at bottom left & right */}
                <div className="absolute bottom-0 left-4 h-6 w-6 rounded-md border border-[var(--dash-border)] text-[9px] font-mono grid place-items-center z-10 animate-[subagent-active-left_3.5s_infinite] text-sky-400">
                  R
                </div>
                <div className="absolute bottom-0 right-4 h-6 w-6 rounded-md border border-[var(--dash-border)] text-[9px] font-mono grid place-items-center z-10 animate-[subagent-active-right_3.5s_infinite] text-pink-400">
                  C
                </div>
              </div>
            </div>
          )}

          {i === 3 && (
            <div className="flex flex-col justify-between h-full">
              <div className="text-[9px] text-[var(--dash-muted)] font-mono border-b border-[var(--dash-border)] pb-1.5 mb-1.5 flex items-center justify-between">
                <span>DELIVERED RESPONSE</span>
                <span className="text-[8px] text-emerald-400 font-bold tracking-wider">TELEGRAM</span>
              </div>
              
              <div className="flex-1 flex flex-col justify-center min-h-[64px]">
                {missionState === 'typing' ? (
                  <div className="flex items-center gap-2 text-[10.5px] text-[var(--dash-muted)] font-mono pl-2 animate-pulse">
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-emerald-400" />
                    <span>Sage compiling SWOT</span>
                    <span className="inline-flex gap-0.5">
                      <span className="h-1 w-1 rounded-full bg-[var(--dash-muted)] animate-bounce" style={{ animationDelay: '0s' }} />
                      <span className="h-1 w-1 rounded-full bg-[var(--dash-muted)] animate-bounce" style={{ animationDelay: '0.2s' }} />
                      <span className="h-1 w-1 rounded-full bg-[var(--dash-muted)] animate-bounce" style={{ animationDelay: '0.4s' }} />
                    </span>
                  </div>
                ) : (
                  <div className="rounded border border-emerald-500/20 bg-emerald-500/5 p-2 text-[10px] leading-tight text-[var(--dash-text-strong)] flex items-start gap-2 animate-[pop-in_0.3s_ease-out] shadow-sm">
                    <MessageCircle className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between">
                        <p className="font-bold text-emerald-400 text-[9px] font-mono">Sage Bot ✓</p>
                        <span className="text-[8px] text-[var(--dash-muted)]">Just now</span>
                      </div>
                      <p className="mt-1 text-[9.5px] text-[var(--dash-text-strong)] font-mono leading-normal">
                        SWOT complete: Acme bumped rates to $49/mo <code>[1]</code>.
                      </p>
                      <div className="mt-1.5 pt-1 border-t border-emerald-500/10 flex items-center gap-1.5 text-[8.5px] font-mono text-emerald-400/80">
                        <span>Sources:</span>
                        <span className="bg-emerald-500/10 px-1 rounded">[[acme_tier]]</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

interface ShowcaseStepCardProps {
  num: string
  icon: any
  title: string
  desc: string
  accent: string
  isActive: boolean
  onClick: () => void
  onMouseEnter: () => void
}

function ShowcaseStepCard({
  num,
  icon: StepIcon,
  title,
  desc,
  accent,
  isActive,
  onClick,
  onMouseEnter,
}: ShowcaseStepCardProps) {
  const { ref, onMouseMove } = useSpotlight()

  return (
    <div
      ref={ref}
      onMouseMove={onMouseMove}
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      className={`dash-panel dash-grain dash-spotlight dash-interactive relative rounded-2xl p-5 transition-all duration-300 text-left cursor-pointer group ${
        isActive
          ? 'active-card -translate-y-[2px] border-[var(--dash-border-glow)] shadow-[var(--dash-shadow-md),0_0_0_1px_var(--dash-border-glow)_inset,0_0_38px_-8px_var(--dash-accent-soft)] scale-[1.01]'
          : 'hover:-translate-y-[1px]'
      }`}
      style={{
        borderColor: isActive ? accent : 'var(--dash-border)',
        '--mx': '50%',
        '--my': '50%',
        ['--dash-border-glow' as any]: accent + '80',
        ['--dash-accent-soft' as any]: accent + '20',
      } as React.CSSProperties}
    >
      <span className="dash-spotlight-glow" aria-hidden />

      {/* Internal Active Accent Stripe Indicator (left edge) */}
      {isActive && (
        <div
          className="absolute left-0 top-0 bottom-0 w-[4px] rounded-r-md transition-all duration-500 animate-pulse"
          style={{
            background: accent,
            boxShadow: `0 0 10px ${accent}`,
          }}
        />
      )}

      <div className="relative z-[1]">
        <div className="flex items-center gap-3.5 mb-2">
          <span
            className="font-mono text-xl md:text-2xl font-bold tracking-tight transition-opacity duration-300"
            style={{
              color: isActive ? accent : 'var(--dash-subtle)',
              opacity: isActive ? 1 : 0.45,
            }}
          >
            {num}
          </span>

          <div
            className="w-7 h-7 rounded-lg grid place-items-center shrink-0 border transition-all duration-300"
            style={{
              background: isActive ? `${accent}18` : 'rgba(255,255,255,0.02)',
              borderColor: isActive ? `${accent}44` : 'var(--dash-border)',
              color: isActive ? accent : 'var(--dash-muted)',
            }}
          >
            <StepIcon size={14} />
          </div>

          <h3
            className={`text-base font-semibold tracking-tight transition-colors duration-300 ${
              isActive ? 'text-[var(--dash-text-strong)] font-bold' : 'text-[var(--dash-text)] opacity-70 group-hover:opacity-90'
            }`}
          >
            {title}
          </h3>
        </div>

        <p
          className="text-xs leading-relaxed transition-opacity duration-500 pl-8 font-normal"
          style={{
            color: isActive ? 'var(--dash-text)' : 'var(--dash-muted)',
            opacity: isActive ? 0.9 : 0.45,
          }}
        >
          {desc}
        </p>
      </div>
    </div>
  )
}

function HowItWorksShowcase() {
  const [activeStep, setActiveStep] = useState(0)
  const [userInteracted, setUserInteracted] = useState(false)

  // Step 1: Ingest Simulation States
  const [ingestStatus, setIngestStatus] = useState<'dropping' | 'parsing' | 'graphing' | 'done'>('dropping')
  const [progressVal, setProgressVal] = useState(0)

  // Step 2: Squad Toggle Animation States
  const [toggledSkill, setToggledSkill] = useState(false)
  const [promptText, setPromptText] = useState('')

  // Step 3: Mission execution states
  const [missionStatus, setMissionStatus] = useState<'typing' | 'decomposing' | 'scouting' | 'synthesizing' | 'done'>('typing')
  const [typedCommand, setTypedCommand] = useState('')

  // Auto cycling
  useEffect(() => {
    if (userInteracted) return
    const interval = setInterval(() => {
      setActiveStep(prev => (prev + 1) % 3)
    }, 10000) // 10 seconds per step to let visual animations complete
    return () => clearInterval(interval)
  }, [userInteracted])

  // Reset and trigger animations based on activeStep
  useEffect(() => {
    if (activeStep === 0) {
      setIngestStatus('dropping')
      setProgressVal(0)
      
      const parseTimeout = setTimeout(() => {
        setIngestStatus('parsing')
        let p = 0
        const progInterval = setInterval(() => {
          p += 5
          setProgressVal(p)
          if (p >= 100) {
            clearInterval(progInterval)
            setIngestStatus('graphing')
            
            const doneTimeout = setTimeout(() => {
              setIngestStatus('done')
            }, 1500)
            return () => clearTimeout(doneTimeout)
          }
        }, 100)
        return () => clearInterval(progInterval)
      }, 1500)

      return () => clearTimeout(parseTimeout)
    } else if (activeStep === 1) {
      setToggledSkill(false)
      setPromptText('')
      
      const toggleTimeout = setTimeout(() => {
        setToggledSkill(true)
        
        const targetPrompt = 'Identify rate updates from recent PDFs, update pricing vector space, and draft SWOT report...'
        let cur = ''
        let idx = 0
        const typeInterval = setInterval(() => {
          if (idx < targetPrompt.length) {
            cur += targetPrompt[idx]
            setPromptText(cur)
            idx++
          } else {
            clearInterval(typeInterval)
          }
        }, 30)
        return () => clearInterval(typeInterval)
      }, 1500)

      return () => clearTimeout(toggleTimeout)
    } else if (activeStep === 2) {
      setMissionStatus('typing')
      setTypedCommand('')
      
      const targetCommand = 'Map Acme pricing changes & draft SWOT alert'
      let cmd = ''
      let idx = 0
      const typeInterval = setInterval(() => {
        if (idx < targetCommand.length) {
          cmd += targetCommand[idx]
          setTypedCommand(cmd)
          idx++
        } else {
          clearInterval(typeInterval)
          
          setMissionStatus('decomposing')
          const t1 = setTimeout(() => {
            setMissionStatus('scouting')
            
            const t2 = setTimeout(() => {
              setMissionStatus('synthesizing')
              
              const t3 = setTimeout(() => {
                setMissionStatus('done')
              }, 1800)
              return () => clearTimeout(t3)
            }, 1800)
            return () => clearTimeout(t2)
          }, 1200)
          return () => clearTimeout(t1)
        }
      }, 40)

      return () => clearInterval(typeInterval)
    }
  }, [activeStep])

  const renderStep1 = () => {
    return (
      <div className="flex-grow flex flex-col justify-between h-full animate-[fade-in_0.3s_ease-out] relative">
        <div className="grid grid-cols-2 gap-4 md:gap-5 h-full flex-grow items-stretch">
          {/* Left Ingestion Dropzone */}
          <div 
            className="flex flex-col justify-between rounded-xl border border-[var(--dash-border)] p-4 relative overflow-hidden min-h-[220px] flex-grow transition-all duration-500 hover:border-[var(--dash-border-bright)]"
            style={{
              background: 'linear-gradient(145deg, rgba(30,30,35,0.4) 0%, rgba(20,20,24,0.4) 100%)',
              boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.05), 0 8px 32px rgba(0,0,0,0.2)'
            }}
          >
            <div className="text-[9.5px] text-[var(--dash-muted)] font-mono border-b border-[var(--dash-border)] pb-2.5 flex items-center justify-between">
              <span className="tracking-[0.1em]">SECURE VAULT GATEWAY</span>
              <span className={`font-bold uppercase tracking-widest ${ingestStatus === 'done' ? 'text-emerald-400' : 'text-[var(--accent-bright)] animate-pulse'}`}>
                {ingestStatus === 'dropping' ? 'INCOMING' : ingestStatus === 'parsing' ? 'INDEXING' : 'READY'}
              </span>
            </div>

            <div className="flex-1 flex flex-col justify-center items-center mt-2">
              {ingestStatus === 'dropping' && (
                <div className="flex flex-col items-center justify-center text-center p-3 animate-[pulse_2s_infinite]">
                  <div className="relative h-14 w-14 border border-dashed border-[var(--accent)]/40 rounded-xl flex items-center justify-center bg-[var(--accent)]/10 mb-4 shadow-[0_0_24px_rgba(255,122,31,0.15)]">
                    <FileText className="h-7 w-7 text-[var(--accent-bright)] animate-[bounce_1.5s_infinite]" />
                  </div>
                  <span className="text-[11px] font-mono text-[var(--text-primary)]">market_update_q4.pdf</span>
                  <span className="text-[9px] text-[var(--text-muted)] mt-1.5 uppercase tracking-widest">Dropping to workspace...</span>
                </div>
              )}

              {ingestStatus === 'parsing' && (
                <div className="w-full space-y-4 px-2">
                  <div className="flex items-center gap-2.5 rounded-lg border border-[var(--dash-border)] bg-[#0d0d10]/80 px-3 py-2.5 shadow-inner">
                    <Loader2 className="h-4 w-4 animate-spin text-[var(--accent-bright)] shrink-0" />
                    <span className="text-[10.5px] font-mono text-[var(--text-primary)] flex-1 truncate">market_update_q4.pdf</span>
                    <span className="text-[8.5px] text-[var(--dash-muted)] uppercase tracking-wider font-semibold">42KB</span>
                  </div>
                  
                  <div className="space-y-1.5">
                    <div className="h-1.5 w-full bg-[var(--dash-border)] rounded-full overflow-hidden relative">
                      <div 
                        className="absolute top-0 bottom-0 left-0 rounded-full transition-all duration-150 shadow-[0_0_12px_var(--accent)]" 
                        style={{ 
                          width: `${progressVal}%`,
                          background: 'linear-gradient(90deg, var(--accent) 0%, var(--accent-bright) 100%)'
                        }} 
                      />
                    </div>
                    <div className="flex justify-between text-[9px] font-mono text-[var(--dash-muted)] tracking-wider uppercase">
                      <span>{progressVal < 40 ? 'Extracting text...' : progressVal < 80 ? 'Generating embeddings...' : 'Vector mapping...'}</span>
                      <span className="text-[var(--accent-bright)]">{progressVal}%</span>
                    </div>
                  </div>
                </div>
              )}

              {(ingestStatus === 'graphing' || ingestStatus === 'done') && (
                <div className="text-center py-2 space-y-3.5 w-full animate-[pop-in_0.4s_cubic-bezier(0.16,1,0.3,1)]">
                  <div className="relative inline-flex h-10 w-10 items-center justify-center rounded-full border border-emerald-500/30 bg-emerald-500/10 text-emerald-400 shadow-[0_0_24px_rgba(16,185,129,0.2)]">
                    <div className="absolute inset-0 rounded-full bg-emerald-400/20 blur-md animate-pulse" />
                    <CheckCircle2 className="h-5 w-5 relative z-10" />
                  </div>
                  <div>
                    <p className="text-[12.5px] font-mono font-semibold text-[var(--text-primary)] tracking-wide">Ingest Complete</p>
                    <p className="text-[9.5px] text-[var(--dash-muted)] mt-1 font-mono tracking-wide">Structured memory page built</p>
                  </div>
                  
                  <div className="flex flex-wrap gap-2 justify-center px-2 mt-2">
                    <span className="text-[8.5px] font-mono text-emerald-300 border border-emerald-500/20 bg-emerald-500/10 rounded-md px-2 py-1 shadow-[0_0_12px_rgba(16,185,129,0.1)] transition-transform hover:scale-105">[[Acme Co]]</span>
                    <span className="text-[8.5px] font-mono text-[var(--accent-bright)] border border-[var(--accent)]/30 bg-[var(--accent)]/10 rounded-md px-2 py-1 shadow-[0_0_12px_rgba(255,122,31,0.15)] transition-transform hover:scale-105">[[SaaS Pricing]]</span>
                    <span className="text-[8.5px] font-mono text-sky-300 border border-sky-500/30 bg-sky-500/10 rounded-md px-2 py-1 shadow-[0_0_12px_rgba(56,189,248,0.15)] transition-transform hover:scale-105">[[SWOT]]</span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Right Concept Map */}
          <div 
            className="rounded-xl border border-[var(--dash-border)] p-4 flex flex-col justify-between min-h-[220px] flex-grow transition-all duration-500 hover:border-[var(--dash-border-bright)] relative overflow-hidden"
            style={{
              background: 'linear-gradient(145deg, rgba(30,30,35,0.4) 0%, rgba(20,20,24,0.4) 100%)',
              boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.05), 0 8px 32px rgba(0,0,0,0.2)'
            }}
          >
            <div className="text-[9.5px] text-[var(--dash-muted)] font-mono border-b border-[var(--dash-border)] pb-2.5 tracking-[0.1em] relative z-10">
              AUTO-LINK ENGINE
            </div>
            
            <div className="flex-grow flex items-center justify-center relative overflow-hidden h-40 mt-2">
              {/* Background grid lines for depth */}
              <div className="absolute inset-0" style={{ backgroundImage: 'radial-gradient(rgba(255,255,255,0.03) 1px, transparent 1px)', backgroundSize: '12px 12px' }} />

              <div className="absolute inset-0 flex items-center justify-center">
                <svg className="w-full h-full text-[var(--dash-border)]" viewBox="0 0 140 140" style={{ filter: 'drop-shadow(0 0 6px rgba(0,0,0,0.5))' }}>
                  {(ingestStatus === 'graphing' || ingestStatus === 'done') ? (
                    <>
                      <line x1="70" y1="75" x2="35" y2="40" stroke="var(--accent-bright)" strokeWidth="1.25" className="animate-[draw-connector-line_1s_ease-out_forwards]" style={{ filter: 'drop-shadow(0 0 4px var(--accent))' }} />
                      <line x1="70" y1="75" x2="105" y2="45" stroke="#38bdf8" strokeWidth="1.25" className="animate-[draw-connector-line_1s_ease-out_0.2s_forwards]" style={{ filter: 'drop-shadow(0 0 4px #0284c7)' }} />
                      <line x1="70" y1="75" x2="70" y2="115" stroke="#a78bfa" strokeWidth="1.25" className="animate-[draw-connector-line_1s_ease-out_0.4s_forwards]" style={{ filter: 'drop-shadow(0 0 4px #7c3aed)' }} />
                    </>
                  ) : (
                    <>
                      <line x1="35" y1="40" x2="105" y2="45" stroke="currentColor" strokeWidth="0.75" strokeDasharray="3 3" className="opacity-20 animate-pulse" />
                      <line x1="105" y1="45" x2="70" y2="115" stroke="currentColor" strokeWidth="0.75" strokeDasharray="3 3" className="opacity-20 animate-pulse" />
                    </>
                  )}
                </svg>
              </div>

              {/* Central Node */}
              <div className="absolute h-9 px-2.5 rounded-[10px] border border-[var(--accent)]/40 bg-[var(--accent)]/10 text-[var(--accent-bright)] text-[8.5px] font-mono flex items-center gap-1.5 z-20 shadow-[0_0_20px_rgba(255,122,31,0.2)] backdrop-blur-md animate-[pulse_2.5s_infinite]">
                <FileText className="h-3 w-3" />
                <span className="tracking-wide">market_update</span>
                <div className="absolute inset-0 rounded-[10px] bg-[var(--accent)]/5 animate-ping opacity-20" />
              </div>

              {/* Left Top Node */}
              <div 
                className={`absolute top-3 left-1 md:left-2 h-7 px-2 rounded-lg border text-[8px] font-mono flex items-center justify-center z-20 backdrop-blur-md transition-all duration-700 ease-out ${
                  (ingestStatus === 'graphing' || ingestStatus === 'done')
                    ? 'border-[var(--accent)]/50 bg-[var(--accent)]/10 text-[var(--accent-bright)] scale-100 shadow-[0_0_12px_rgba(255,122,31,0.15)] opacity-100'
                    : 'border-[var(--dash-border)] bg-transparent text-[var(--dash-muted)] scale-90 opacity-0 translate-y-2'
                }`}
              >
                [[Acme Co]]
              </div>
              
              {/* Right Top Node */}
              <div 
                className={`absolute top-5 right-1 md:right-2 h-7 px-2 rounded-lg border text-[8px] font-mono flex items-center justify-center z-20 backdrop-blur-md transition-all duration-700 ease-out delay-150 ${
                  (ingestStatus === 'graphing' || ingestStatus === 'done')
                    ? 'border-sky-500/50 bg-sky-500/10 text-sky-400 scale-100 shadow-[0_0_12px_rgba(56,189,248,0.15)] opacity-100'
                    : 'border-[var(--dash-border)] bg-transparent text-[var(--dash-muted)] scale-90 opacity-0 translate-y-2'
                }`}
              >
                [[Pricing]]
              </div>

              {/* Bottom Node */}
              <div 
                className={`absolute bottom-3 md:bottom-4 h-7 px-2 rounded-lg border text-[8px] font-mono flex items-center justify-center z-20 backdrop-blur-md transition-all duration-700 ease-out delay-300 ${
                  (ingestStatus === 'graphing' || ingestStatus === 'done')
                    ? 'border-purple-500/50 bg-purple-500/10 text-purple-400 scale-100 shadow-[0_0_12px_rgba(168,85,247,0.15)] opacity-100'
                    : 'border-[var(--dash-border)] bg-transparent text-[var(--dash-muted)] scale-90 opacity-0 -translate-y-2'
                }`}
              >
                [[SWOT Analysis]]
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  const renderStep2 = () => {
    return (
      <div className="flex-grow flex flex-col justify-between h-full animate-[fade-in_0.3s_ease-out]">
        <div className="grid grid-cols-2 gap-3 md:gap-4 h-full flex-grow items-stretch">
          {/* Left: Workbench Info */}
          <div className="flex flex-col justify-between rounded-xl border border-[var(--dash-border)] bg-[var(--dash-card-solid)] p-3 relative overflow-hidden min-h-[220px] flex-grow">
            <div className="text-[9px] text-[var(--dash-muted)] font-mono border-b border-[var(--dash-border)] pb-1.5 mb-2 flex items-center justify-between">
              <span>SQUAD AGENT WORKBENCH</span>
              <span className="text-purple-400 font-bold uppercase tracking-wider">CONFIG</span>
            </div>

            <div className="space-y-2.5 flex-grow flex flex-col justify-center">
              <div className="flex items-center gap-2.5 rounded-lg border border-purple-500/20 bg-purple-500/5 p-2 text-xs">
                <span className="h-7 w-7 rounded-lg border border-purple-500/40 bg-purple-500/10 text-[11px] font-bold text-purple-400 grid place-items-center uppercase shadow-sm shrink-0">
                  S
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <h4 className="text-[11px] font-bold text-[var(--dash-text-strong)] font-mono">Sherlock</h4>
                    <span className="text-[7.5px] bg-purple-500/10 border border-purple-500/20 text-purple-400 px-1 rounded font-semibold uppercase tracking-wider">Researcher</span>
                  </div>
                  <p className="text-[9.5px] text-[var(--dash-muted)] font-mono leading-none mt-0.5">Role: Cross-Source Synthesis</p>
                </div>
              </div>

              <div className="rounded-lg border border-[var(--dash-border)] bg-[var(--dash-bg)] p-2.5 font-mono text-[9px] leading-relaxed relative min-h-[82px] flex flex-col flex-grow">
                <span className="text-[8px] text-[var(--dash-muted)] uppercase border-b border-[var(--dash-border)] pb-1 mb-1.5 block">SYSTEM DIRECTIVE PROMPT</span>
                <div className="flex-1 text-[9.5px] text-[var(--dash-text)] leading-normal font-mono">
                  {promptText}
                  <span className="inline-block w-1.5 h-3 bg-purple-500 ml-0.5 animate-pulse" />
                </div>
              </div>
            </div>
          </div>

          {/* Right Skills toggling list */}
          <div className="rounded-xl border border-[var(--dash-border)] bg-[var(--dash-card-solid)] p-3 flex flex-col justify-between min-h-[220px] flex-grow">
            <div>
              <div className="text-[9px] text-[var(--dash-muted)] font-mono border-b border-[var(--dash-border)] pb-1.5 mb-2.5">
                SPECIALIST SKILLS (100+)
              </div>
              
              <div className="space-y-2">
                {[
                  { name: 'Semantic Graph Search', active: true, desc: 'Query and navigate links' },
                  { name: 'Fact Validation Engine', active: true, desc: 'Verify source references' },
                  { name: 'Competitor Rate Tracker', active: toggledSkill, desc: 'Monitor external updates' },
                ].map((skill, idx) => {
                  const isActive = skill.active
                  return (
                    <div 
                      key={idx}
                      className={`p-2 rounded-lg border text-left flex items-center justify-between transition-all duration-300 ${
                        isActive 
                          ? 'border-purple-500/30 bg-purple-500/[0.02] shadow-[0_2px_10px_rgba(167,139,250,0.02)]' 
                          : 'border-[var(--dash-border)] opacity-50 bg-transparent'
                      }`}
                    >
                      <div className="min-w-0 pr-2">
                        <p className={`text-[10px] font-semibold font-mono ${isActive ? 'text-[var(--dash-text-strong)]' : 'text-[var(--dash-muted)]'}`}>
                          {skill.name}
                        </p>
                        <p className="text-[8.5px] text-[var(--dash-muted)] mt-0.5 font-mono">{skill.desc}</p>
                      </div>
                      
                      <div 
                        className={`h-4 w-7 rounded-full p-0.5 transition-all duration-300 relative shrink-0 ${
                          isActive ? 'bg-purple-500' : 'bg-[var(--dash-border-bright)]'
                        }`}
                      >
                        <span 
                          className={`block h-3 w-3 rounded-full bg-white transition-all duration-300 shadow-sm ${
                            isActive ? 'translate-x-3' : 'translate-x-0'
                          }`}
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            <div className="text-[8px] font-mono text-[var(--dash-muted)] text-center pt-1 border-t border-[var(--dash-border)] mt-2">
              {toggledSkill ? 'Skill added, recompiling agent...' : 'Awaiting configuration...'}
            </div>
          </div>
        </div>
      </div>
    )
  }

  const renderStep3 = () => {
    return (
      <div className="flex-grow flex flex-col justify-between h-full animate-[fade-in_0.3s_ease-out] relative">
        <div className="grid grid-cols-2 gap-3 md:gap-4 h-full flex-grow items-stretch">
          {/* Left Terminal Input */}
          <div className="flex flex-col justify-between rounded-xl border border-[var(--dash-border)] bg-[var(--dash-card-solid)] p-3 relative overflow-hidden min-h-[220px] flex-grow">
            <div className="text-[9px] text-[var(--dash-muted)] font-mono border-b border-[var(--dash-border)] pb-1.5 mb-2 flex items-center justify-between">
              <span>MISSION CONTROL INTERFACE</span>
              <span className="text-emerald-400 font-bold uppercase tracking-wider animate-pulse">
                {missionStatus === 'done' ? 'COMPLETE' : 'RUNNING'}
              </span>
            </div>

            <div className="flex-grow flex flex-col gap-2.5 font-mono text-[10px] justify-center">
              <div className="space-y-1.5">
                <div className="flex items-center gap-1.5 text-[var(--dash-muted)]">
                  <span className="text-emerald-400">➜</span>
                  <span>jordan@secondbrain:~$</span>
                  <span className="text-[9px] bg-[var(--dash-soft)] px-1 rounded uppercase tracking-wider text-[var(--dash-muted)] font-mono">CLI</span>
                </div>
                <div className="bg-[var(--dash-bg)] rounded border border-[var(--dash-border)] p-2 min-h-[38px] flex items-center">
                  <span className="text-emerald-400 font-bold mr-1">&gt;</span>
                  <span className="text-[10px] text-[var(--dash-text-strong)] font-mono font-medium">
                    {typedCommand}
                    {missionStatus === 'typing' && <span className="inline-block w-1.5 h-3.5 bg-emerald-500 ml-0.5 animate-pulse" />}
                  </span>
                </div>
              </div>

              {(missionStatus !== 'typing') && (
                <div className="rounded-lg border border-emerald-500/10 bg-emerald-500/5 p-2 text-[9.5px] leading-relaxed text-[var(--dash-muted)] animate-[pop-in_0.3s_ease-out] relative">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-bold text-emerald-400 uppercase text-[8px] font-mono">Sage lead orchestrator</span>
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-ping" />
                  </div>
                  <span className="font-mono">Decomposing objective into task graph. Specialist sub-agents executing in parallel.</span>
                </div>
              )}
            </div>
          </div>

          {/* Right Pipeline checklist */}
          <div className="rounded-xl border border-[var(--dash-border)] bg-[var(--dash-card-solid)] p-3 flex flex-col justify-between min-h-[220px] flex-grow">
            <div>
              <div className="text-[9px] text-[var(--dash-muted)] font-mono border-b border-[var(--dash-border)] pb-1.5 mb-2 flex items-center justify-between">
                <span>TASK RUNTIME PIPELINE</span>
                <span className="text-[8px] bg-[var(--dash-soft)] px-1.5 py-0.5 rounded text-[var(--dash-muted)]">Capped</span>
              </div>
              
              <div className="space-y-1.5">
                {[
                  { task: 'Decompose goal & verify plan', runner: 'Sage', status: missionStatus === 'typing' ? 'pending' : 'done' },
                  { task: 'Search vault pricing sources', runner: 'Ranger', status: missionStatus === 'typing' || missionStatus === 'decomposing' ? 'pending' : missionStatus === 'scouting' ? 'running' : 'done' },
                  { task: 'Synthesize pricing reports', runner: 'Sherlock', status: missionStatus === 'typing' || missionStatus === 'decomposing' || missionStatus === 'scouting' ? 'pending' : missionStatus === 'synthesizing' ? 'running' : 'done' },
                  { task: 'Compile SWOT & alert Telegram', runner: 'Sage', status: missionStatus === 'done' ? 'done' : 'pending' }
                ].map((step, idx) => {
                  return (
                    <div key={idx} className="flex items-center justify-between text-[10px] font-mono py-1 border-b border-[var(--dash-border)] last:border-0">
                      <div className="flex items-center gap-1.5 min-w-0 pr-1">
                        <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${
                          step.status === 'done' 
                            ? 'bg-emerald-400' 
                            : step.status === 'running' 
                            ? 'bg-emerald-400 animate-pulse' 
                            : 'bg-[var(--dash-subtle)]'
                        }`} />
                        <span className={`truncate text-[9.5px] ${step.status === 'done' ? 'text-[var(--dash-muted)] line-through' : 'text-[var(--dash-text-strong)]'}`}>
                          {step.task}
                        </span>
                      </div>
                      
                      <span className={`text-[8px] font-semibold px-1 rounded uppercase tracking-wider shrink-0 ${
                        step.status === 'done' 
                          ? 'bg-emerald-500/10 text-emerald-400' 
                          : step.status === 'running' 
                          ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' 
                          : 'bg-transparent text-[var(--dash-subtle)]'
                      }`}>
                        {step.status === 'running' ? 'Active' : step.runner}
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>

            <div className="text-[8px] font-mono text-[var(--dash-muted)] text-center pt-1 border-t border-[var(--dash-border)] mt-2">
              {missionStatus === 'done' ? 'Execution graph finished.' : 'Running active tasks...'}
            </div>
          </div>
        </div>

        {/* Telegram Toast */}
        {missionStatus === 'done' && (
          <div className="absolute bottom-2 left-2 right-2 rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-3 shadow-xl backdrop-blur-xl animate-[sb-toast-in_0.35s_cubic-bezier(0.16,1,0.3,1)] z-30">
            <div className="flex items-start gap-2">
              <div className="h-6 w-6 rounded-full bg-emerald-500/20 grid place-items-center text-emerald-400 shrink-0 mt-0.5">
                <MessageCircle className="h-3.5 w-3.5" />
              </div>
              <div className="min-w-0 flex-1 text-left">
                <div className="flex items-center justify-between">
                  <span className="font-mono font-bold text-emerald-400 text-[9.5px] tracking-wide">SecondBrain Telegram Alert</span>
                  <span className="font-mono text-[8px] text-[var(--dash-muted)]">Just now</span>
                </div>
                <p className="mt-1 text-[10px] leading-normal font-mono text-[var(--dash-text-strong)]">
                  SWOT draft generated! 📊 Acme bumped base rates by $10/mo [1].
                </p>
                <div className="mt-1.5 flex items-center gap-1.5 text-[8.5px] font-mono text-emerald-400">
                  <span className="text-[8px] bg-emerald-500/20 px-1 rounded uppercase tracking-wider font-bold">CITED</span>
                  <span className="truncate">[[acme_rates_redline.pdf]]</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    )
  }

  const SHOWCASE_STEPS = [
    {
      num: '01',
      icon: Inbox,
      title: 'Build your vault',
      desc: 'Drop in URLs, PDFs, transcripts, notes, and DOCX files. Every source becomes a cited memory page — with summaries, entities, decisions, and provenance, automatically.',
      accent: '#ff7a1f'
    },
    {
      num: '02',
      icon: GitBranch,
      title: 'Assemble your squad',
      desc: 'Name your agents, assign their roles, and equip them from a library of 100+ specialized skills — research, sales, ops, content, finance, and more. Your squad, built for your business.',
      accent: '#a78bfa'
    },
    {
      num: '03',
      icon: Zap,
      title: 'One ask. They run.',
      desc: 'Set a goal. Your lead agent decomposes it into a task graph, specialist sub-agents execute, and results land cited in your vault — or straight to your Telegram.',
      accent: '#34d399'
    }
  ]

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[0.45fr_0.55fr] gap-8 md:gap-12 items-center w-full">
      {/* Left Column: Interactive vertical selector list */}
      <div className="flex flex-col gap-4 relative">
        {SHOWCASE_STEPS.map((step, i) => (
          <ShowcaseStepCard
            key={i}
            num={step.num}
            icon={step.icon}
            title={step.title}
            desc={step.desc}
            accent={step.accent}
            isActive={activeStep === i}
            onClick={() => {
              setActiveStep(i)
              setUserInteracted(true)
            }}
            onMouseEnter={() => {
              setActiveStep(i)
              setUserInteracted(true)
            }}
          />
        ))}
      </div>

      {/* Right Column: Premium Mock Workspace */}
      <div className="sb-dashboard sb-dashboard--inline sb-dashboard-clean w-full relative animate-[dash-rise_0.8s_var(--ease-out-expo)_both]">
        <div 
          className="relative rounded-2xl border border-[var(--dash-border)] bg-[var(--dash-glass-strong)] backdrop-blur-xl shadow-2xl p-4 md:p-5 h-[390px] flex flex-col justify-between overflow-hidden"
          style={{
            boxShadow: '0 20px 50px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.05)'
          }}
        >
          {/* Accent radial glow background */}
          <div 
            className="absolute inset-0 pointer-events-none transition-all duration-700 blur-[80px] opacity-20"
            style={{
              background: activeStep === 0 
                ? 'radial-gradient(circle at 50% 50%, #ff7a1f, transparent 70%)'
                : activeStep === 1
                ? 'radial-gradient(circle at 50% 50%, #a78bfa, transparent 70%)'
                : 'radial-gradient(circle at 50% 50%, #34d399, transparent 70%)'
            }}
          />

          {/* Console Header */}
          <div className="flex items-center justify-between border-b border-[var(--dash-border)] pb-3.5 mb-4 relative z-10">
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1.5 opacity-80 hover:opacity-100 transition-opacity">
                <div className="w-3 h-3 rounded-full bg-[#ff5f56] shadow-[0_0_8px_rgba(255,95,86,0.5)] border border-[#ff5f56]/50" />
                <div className="w-3 h-3 rounded-full bg-[#ffbd2e] shadow-[0_0_8px_rgba(255,189,46,0.5)] border border-[#ffbd2e]/50" />
                <div className="w-3 h-3 rounded-full bg-[#27c93f] shadow-[0_0_8px_rgba(39,201,63,0.5)] border border-[#27c93f]/50" />
              </div>
              <span className="text-[10.5px] font-mono text-[var(--text-primary)] font-semibold ml-3 tracking-widest uppercase">
                {activeStep === 0 ? 'VAULT / INGESTION_DAEMON' : activeStep === 1 ? 'SQUAD / ASSEMBLER' : 'MISSION / DISPATCHER'}
              </span>
            </div>
            <span className="text-[9px] font-mono text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 px-2.5 py-1 rounded-md uppercase tracking-[0.15em] font-bold shadow-[0_0_12px_rgba(16,185,129,0.15)]">
              {activeStep === 0 ? 'Index Active' : activeStep === 1 ? 'Configure' : 'Deploy Live'}
            </span>
          </div>

          {/* Console Interior Content */}
          <div className="flex-grow relative z-10 flex flex-col h-full justify-between">
            {activeStep === 0 && renderStep1()}
            {activeStep === 1 && renderStep2()}
            {activeStep === 2 && renderStep3()}
          </div>
        </div>

        <style jsx>{`
          @keyframes pop-in {
            0% { transform: scale(0.96); opacity: 0; }
            100% { transform: scale(1); opacity: 1; }
          }
          @keyframes draw-connector-line {
            0% { stroke-dashoffset: 100; stroke-dasharray: 100; }
            100% { stroke-dashoffset: 0; stroke-dasharray: 100; }
          }
          @keyframes sb-toast-in {
            from { opacity: 0; transform: translateY(16px); }
            to   { opacity: 1; transform: translateY(0); }
          }
        `}</style>
      </div>
    </div>
  )
}

function UseCaseCard({ item, i }: { item: typeof USE_CASES[0]; i: number }) {
  const { ref, onMouseMove } = useSpotlight()
  return (
    <div
      ref={ref}
      onMouseMove={onMouseMove}
      className="dash-panel dash-grain dash-spotlight dash-interactive relative rounded-2xl p-4 md:p-6 transition-all duration-300"
      style={{
        animationDelay: `${i * 100}ms`,
      }}
    >
      <span className="dash-spotlight-glow" aria-hidden />
      <div className="relative z-[1]">
        <div className="mb-4 md:mb-5 flex items-center justify-between gap-3">
          <div
            className="w-9 h-9 rounded-xl grid place-items-center"
            style={{
              background: 'color-mix(in srgb, var(--dash-accent) 12%, transparent)',
              border: '1px solid color-mix(in srgb, var(--dash-accent) 22%, transparent)',
            }}
          >
            <item.icon size={16} className="text-[var(--dash-accent)]" />
          </div>
          <span className="mono text-[9px] tracking-widest text-[var(--dash-muted)]">
            USE CASE {String(i + 1).padStart(2, '0')}
          </span>
        </div>
        <h3 className="text-base md:text-lg font-semibold tracking-tight text-[var(--dash-text-strong)]">
          {item.title}
        </h3>
        <p className="mt-3 text-sm leading-6 md:leading-7 text-[var(--dash-muted)]">
          {item.desc}
        </p>
      </div>
    </div>
  )
}

function PricingCard({ plan }: { plan: {
  name: string
  price: string
  originalPrice?: string
  period: string
  subPrice?: string
  roles?: string[]
  badge: string | null
  desc: string
  features: string[]
  cta: string
  href: string
  highlight: boolean
  squad: boolean
}}) {
  const { ref, onMouseMove } = useSpotlight()
  return (
    <div
      ref={ref}
      onMouseMove={onMouseMove}
      className={`dash-panel dash-grain dash-spotlight dash-interactive relative rounded-[2rem] p-6 md:p-8 transition-all duration-500 border-[var(--dash-border)] ${
        plan.highlight 
          ? 'shadow-[0_24px_80px_-12px_rgba(255,102,0,0.15)] ring-1 ring-[var(--dash-border-glow)]/30' 
          : plan.squad 
          ? 'shadow-[0_24px_80px_-12px_rgba(200,200,207,0.05)]' 
          : ''
      }`}
      style={{
        ['--dash-accent' as any]: plan.highlight 
          ? 'var(--accent)' 
          : plan.squad 
          ? '#c8c8cf' 
          : 'rgba(255,255,255,0.15)'
      }}
    >
      <span className="dash-spotlight-glow" aria-hidden />

      <div className="relative z-[1] flex items-start justify-between gap-2 mb-2 min-h-[28px]">
        <p className="type-mono-xs text-[var(--dash-muted)] tracking-widest pt-1">
          {plan.name.toUpperCase()}
        </p>
        {plan.badge && (
          <div
            className="type-mono-xs px-2 py-0.5 rounded-full tracking-widest border text-[9px] md:text-[10px] whitespace-nowrap"
            style={
              plan.highlight
                ? {
                    background: 'color-mix(in srgb, var(--dash-accent) 14%, transparent)',
                    borderColor: 'color-mix(in srgb, var(--dash-accent) 32%, transparent)',
                    color: 'var(--dash-accent-2)',
                  }
                : {
                    background: 'color-mix(in srgb, #c8c8cf 10%, transparent)',
                    borderColor: 'color-mix(in srgb, #c8c8cf 25%, transparent)',
                    color: '#c8c8cf',
                  }
            }
          >
            {plan.badge}
          </div>
        )}
      </div>
      <div className="relative z-[1] flex items-end gap-2 mb-2">
        <div className="flex items-baseline gap-2">
          {plan.originalPrice && (
            <p className="text-xl md:text-2xl font-medium text-[var(--dash-muted)] line-through decoration-red-500/50 decoration-2">
              {plan.originalPrice}
            </p>
          )}
          <p className="text-4xl md:text-5xl font-semibold tracking-tight text-[var(--dash-text-strong)]">
            {plan.price}
          </p>
        </div>
        <p className="text-[var(--dash-muted)] mb-1 text-sm">{plan.period}</p>
      </div>
      {plan.subPrice && (
        <p className="relative z-[1] text-[11px] text-[var(--dash-muted)] mb-5">
          {plan.subPrice}
        </p>
      )}
      <p className="relative z-[1] text-xs text-[var(--dash-text)] mb-3 leading-5">
        {plan.desc}
      </p>

      {plan.roles && (
        <div className="relative z-[1] flex flex-wrap gap-1.5 mb-6">
          {plan.roles.map(role => (
            <span key={role} className="dash-inset px-2.5 py-1.5 text-[11px] font-medium text-[var(--dash-text)] rounded-full border border-[var(--dash-border)]">
              {role}
            </span>
          ))}
        </div>
      )}

      <ul className="relative z-[1] space-y-3 mb-6 md:mb-8">
        {plan.features.map((f) => (
          <li key={f} className="flex items-start gap-3 text-sm text-[var(--dash-muted)]">
            <span
              className="mt-1.5 w-1 h-1 rounded-full shrink-0"
              style={{
                background: plan.highlight
                  ? 'var(--dash-accent)'
                  : plan.squad
                  ? '#c8c8cf'
                  : 'var(--dash-muted)',
              }}
            />
            {f}
          </li>
        ))}
      </ul>

      <Link
        href={plan.href}
        className="relative z-[1] block text-center text-sm font-semibold py-3.5 rounded-xl transition-all duration-300 border"
        style={
          plan.highlight
            ? {
                color: 'var(--text-inverse)',
                background: 'linear-gradient(135deg, var(--accent-bright), var(--accent))',
                borderColor: 'transparent',
                boxShadow: '0 8px 20px -6px rgba(255,102,0,0.4)',
              }
            : plan.squad
            ? {
                color: 'var(--dash-text-strong)',
                background: 'color-mix(in srgb, #c8c8cf 8%, transparent)',
                borderColor: 'color-mix(in srgb, #c8c8cf 30%, transparent)',
              }
            : {
                color: 'var(--dash-text-strong)',
                background: 'transparent',
                borderColor: 'var(--dash-border-bright)',
              }
        }
      >
        {plan.cta}
      </Link>
    </div>
  )
}

function FAQAccordionItem({ item, i }: { item: typeof FAQS[0]; i: number }) {
  const [isOpen, setIsOpen] = useState(false)
  const { ref, onMouseMove } = useSpotlight()
  
  return (
    <article
      ref={ref}
      onMouseMove={onMouseMove}
      className={`dash-panel dash-grain dash-spotlight dash-interactive relative rounded-[14px] md:rounded-[18px] border overflow-hidden cursor-pointer transition-all duration-500 group ${isOpen ? 'border-[var(--dash-border-glow)]' : 'border-[var(--dash-border)] hover:border-[var(--dash-border-bright)]'}`}
      onClick={() => setIsOpen(!isOpen)}
      style={{
        animationDelay: `${i * 90}ms`,
        boxShadow: isOpen ? '0 0 30px rgba(255,122,31,0.08), inset 0 1px 0 rgba(255,255,255,0.05)' : undefined
      }}
    >
      <span className="dash-spotlight-glow" aria-hidden />
      <div className="relative z-[1] p-3.5 md:p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3 md:gap-4 flex-1">
            <span className="type-mono-xs mt-1 tracking-widest text-[var(--accent-bright)] shrink-0 w-6 opacity-70 group-hover:opacity-100 transition-opacity">
              {String(i + 1).padStart(2, '0')}
            </span>
            <h3 className="text-[0.95rem] md:text-[1.05rem] font-medium tracking-[-0.01em] text-[var(--text-primary)] group-hover:text-[var(--accent-bright)] transition-colors duration-300">
              {item.q}
            </h3>
          </div>
          
          <div className="flex items-center gap-3 shrink-0 mt-1">
            <span
              className="h-1.5 w-1.5 rounded-full transition-all duration-300"
              style={{
                background: isOpen ? 'var(--accent)' : 'var(--text-muted)',
                boxShadow: isOpen ? '0 0 10px var(--accent)' : 'none',
              }}
            />
            <span 
              className="text-[var(--text-muted)] font-mono select-none text-xl leading-none shrink-0 transition-all duration-300 flex items-center justify-center w-4 h-4" 
              style={{ 
                transform: isOpen ? 'rotate(45deg)' : 'rotate(0deg)', 
                color: isOpen ? 'var(--accent)' : undefined,
                opacity: isOpen ? 1 : 0.5 
              }}
            >
              +
            </span>
          </div>
        </div>
        
        <div 
          className="transition-all duration-500 ease-in-out overflow-hidden"
          style={{
            maxHeight: isOpen ? '240px' : '0px',
            opacity: isOpen ? 1 : 0,
            marginTop: isOpen ? '12px' : '0px',
          }}
        >
          <div className="pt-3 pl-9 md:pl-10 text-[0.85rem] md:text-[0.9rem] leading-[1.65] text-[var(--text-secondary)]">
            {item.a}
          </div>
        </div>
      </div>
    </article>
  )
}

export default function LandingPage() {
  const [scrolled, setScrolled] = useState(false)
  const [hoveredBadge, setHoveredBadge] = useState<string | null>(null)
  const [activePrinciple, setActivePrinciple] = useState(0)
  const [userInteracted, setUserInteracted] = useState(false)

  useEffect(() => {
    if (userInteracted) return
    const interval = setInterval(() => {
      setActivePrinciple(prev => (prev + 1) % 4)
    }, 5000)
    return () => clearInterval(interval)
  }, [userInteracted])

  const vaultSpotlight = useSpotlight<HTMLDivElement>()
  const systemSpotlight = useSpotlight<HTMLDivElement>()
  const structuredData = [
    {
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      name: 'SecondBrain Cloud',
      url: SITE_URL,
      description:
        'SecondBrain Cloud is a private AI memory workspace for source-backed research, notes, documents, meetings, and cited search.',
    },
    {
      '@context': 'https://schema.org',
      '@type': 'SoftwareApplication',
      name: 'SecondBrain Cloud',
      applicationCategory: 'BusinessApplication',
      operatingSystem: 'Web',
      url: SITE_URL,
      description:
        'AI second brain software for capturing sources, building a private knowledge base, and searching your own memory with cited answers.',
      offers: [
        { '@type': 'Offer', price: '0', priceCurrency: 'USD', name: 'Free' },
        { '@type': 'Offer', price: '18', priceCurrency: 'USD', name: 'Pro' },
      ],
    },
    {
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: FAQS.map((item) => ({
        '@type': 'Question',
        name: item.q,
        acceptedAnswer: {
          '@type': 'Answer',
          text: item.a,
        },
      })),
    },
  ]

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20)
    window.addEventListener('scroll', onScroll)
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <div className="site-ambient min-h-screen bg-[var(--bg)] text-[var(--text-primary)] overflow-x-hidden">
      <div
        style={{ display: 'none' }}
        dangerouslySetInnerHTML={{
          __html: `<script type="application/ld+json">${JSON.stringify(structuredData)}</script>`,
        }}
      />

      {/* Nav — Apple Silicon treatment */}
      <nav
        className={`site-nav fixed top-0 inset-x-0 z-50 transition-all duration-500 ${
          scrolled ? 'site-nav--scrolled' : ''
        }`}
      >
        <div className="max-w-7xl mx-auto px-3.5 md:px-6 py-2 md:py-4 flex items-center justify-between gap-2.5 md:gap-3">
          {/* Brand */}
          <Link href="/" className="flex items-center gap-2.5 md:gap-3 group min-w-0">
            <span
              className="relative grid h-8 w-8 md:h-9 md:w-9 shrink-0 place-items-center overflow-hidden rounded-full border border-[var(--border-bright)] transition-all duration-300 group-hover:border-[var(--border-glow)]"
              style={{ background: 'var(--metallic)' }}
            >
              <span
                aria-hidden
                className="absolute inset-0 pointer-events-none rounded-full"
                style={{ background: 'var(--metallic-hi)' }}
              />
              <BrainMark
                size={22}
                className="relative z-[1] text-[#e5e5ea] transition-transform duration-500 group-hover:scale-[1.08]"
              />
            </span>
            <span className="text-[13px] md:text-sm font-semibold tracking-tight text-[var(--text-primary)] truncate">
              SecondBrain<span className="hidden sm:inline text-[var(--text-muted)] font-normal ml-1">Cloud</span>
            </span>
          </Link>

          {/* Links */}
          <div className="hidden md:flex items-center gap-6 lg:gap-8">
            {NAV_LINKS.map((l) => (
              <a
                key={l.label}
                href={l.href}
                className="type-mono-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
              >
                {l.label}
              </a>
            ))}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-1.5 md:gap-3 shrink-0">
            <ThemeToggle />
            <Link
              href="/sign-in"
              className="hidden sm:inline text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors px-2.5 py-2"
            >
              Sign in
            </Link>
            <Link
              href="/sign-up"
              className="nav-cta relative inline-flex items-center gap-1.5 overflow-hidden rounded-[10px] border border-[var(--border-bright)] px-2.5 sm:px-3 md:px-4 py-2 text-[10.5px] md:text-xs font-semibold tracking-[-0.005em] transition-all duration-300 hover:border-[var(--border-glow)] hover:-translate-y-[1px]"
              style={{
                background: 'var(--metallic)',
                boxShadow: 'var(--shadow-1)',
              }}
            >
              <span
                aria-hidden
                className="pointer-events-none absolute inset-0"
                style={{ background: 'var(--metallic-hi)' }}
              />
              <span className="nav-cta-label relative z-[1]">
                <span className="sm:hidden">Start</span>
                <span className="hidden sm:inline">Get early access</span>
              </span>
            </Link>
          </div>
        </div>
        <div className="md:hidden max-w-7xl mx-auto px-3.5 pb-2 overflow-x-auto">
          <div className="flex items-center gap-2 min-w-max">
            {NAV_LINKS.map((l) => (
              <a
                key={l.label}
                href={l.href}
	                className="mono text-[8px] tracking-widest px-2.5 py-1.5 rounded-full border whitespace-nowrap"
	                style={{
	                  color: 'var(--text-secondary)',
	                  borderColor: 'color-mix(in srgb, var(--border-bright) 52%, transparent)',
	                  background: 'color-mix(in srgb, var(--surface) 54%, transparent)',
	                }}
              >
                {l.label.toUpperCase()}
              </a>
            ))}
          </div>
        </div>
      </nav>

      {/* Hero — SecondBrain two-column with autonomous brain canvas */}
      <Hero />

      {/* Ticker */}
      <Ticker />

      {/* See it in action — live multi-agent demo (conversion driver) */}
      <AgentShowcase />

      {/* Product thesis */}
      <section className="relative py-12 md:py-16 overflow-hidden">
        <div className="absolute inset-0 dot-bg opacity-30" />
        <div
          aria-hidden
          className="absolute inset-x-0 top-0 h-px"
          style={{ background: 'linear-gradient(90deg, transparent, var(--border-bright), transparent)' }}
        />
        <div className="relative mx-auto max-w-7xl px-4 md:px-6">
          <div className="grid grid-cols-1 lg:grid-cols-[0.95fr_1.05fr] gap-8 md:gap-10 lg:gap-14 items-center">
            {/* Left Column: Interactive Navigation */}
            <div>
              <p className="type-mono-xs text-[var(--text-muted)] tracking-widest mb-3">
                PRODUCT THESIS
              </p>
              <h2 className="text-[1.9rem] md:text-5xl font-semibold tracking-tight leading-[1.08] text-[var(--text-primary)]">
                A brain your squad
                <span className="block brushed-text">actually knows.</span>
              </h2>
              <p className="mt-3 text-[13.5px] text-[var(--text-secondary)] leading-relaxed max-w-xl mb-6">
                Generic agents connect to search engines and guess. SecondBrain equips your squad with a secure private vault of decisions, documents, and transcripts. Sourced facts, always.
              </p>

              <div className="space-y-2.5">
                {PRINCIPLES.map((p, i) => {
                  const isActive = activePrinciple === i
                  const Icon = p.icon
                  return (
                    <div
                      key={p.label}
                      onClick={() => {
                        setActivePrinciple(i)
                        setUserInteracted(true)
                      }}
                      onMouseEnter={() => {
                        setActivePrinciple(i)
                        setUserInteracted(true)
                      }}
                      className={`group flex items-start gap-4 rounded-xl border p-3.5 text-left cursor-pointer transition-all duration-300 ${
                        isActive
                          ? 'border-[var(--border-glow)] bg-[color-mix(in_srgb,var(--accent)_6%,transparent)] shadow-[0_4px_20px_-4px_color-mix(in_srgb,var(--accent)_12%,transparent)]'
                          : 'border-[var(--border)] bg-transparent hover:border-[var(--border-bright)]'
                      }`}
                    >
                      <span
                        className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg border transition-all duration-300 ${
                          isActive
                            ? 'border-orange-500/40 bg-orange-500/10 text-[var(--accent)] scale-105'
                            : 'border-[var(--border)] text-[var(--text-secondary)] group-hover:text-[var(--text-primary)]'
                        }`}
                      >
                        <Icon className="h-4 w-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between">
                          <h4 className={`text-[13px] font-semibold transition-colors duration-200 ${
                            isActive ? 'text-[var(--text-primary)]' : 'text-[var(--text-secondary)] group-hover:text-[var(--text-primary)]'
                          }`}>
                            {p.label}
                          </h4>
                          {isActive && (
                            <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent)] animate-pulse" />
                          )}
                        </div>
                        <p className={`text-[11.5px] mt-1 leading-normal transition-colors duration-200 ${
                          isActive ? 'text-[var(--text-secondary)]' : 'text-[var(--text-muted)]'
                        }`}>
                          {p.title}
                        </p>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Right Column: Dynamic Showcase Mockup */}
            <div className="relative sb-dashboard sb-dashboard--inline sb-dashboard-clean h-[360px] md:h-[390px] flex flex-col justify-between dash-panel dash-panel-strong dash-grain p-5">
              {/* Radial glow background */}
              <div
                aria-hidden
                className="absolute inset-0 -z-10 opacity-30 pointer-events-none blur-[60px]"
                style={{
                  background: 'radial-gradient(circle at 50% 50%, var(--accent), transparent 70%)',
                }}
              />

              {/* Active Mock Content */}
              {activePrinciple === 0 && (
                <div className="flex-1 flex flex-col justify-between animate-[fade-in_0.3s_ease-out]">
                  {/* Private Vault Header */}
                  <div className="flex items-center justify-between border-b border-[var(--dash-border)] pb-3 mb-3">
                    <div className="flex items-center gap-2">
                      <Shield className="h-4 w-4 text-emerald-400" />
                      <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--dash-text-strong)]">Private Vault System</span>
                    </div>
                    <span className="flex items-center gap-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 text-[9px] text-emerald-400 font-medium">
                      <Lock className="h-2.5 w-2.5" /> Isolated
                    </span>
                  </div>

                  {/* Vault contents list */}
                  <div className="space-y-2.5 flex-1">
                    {[
                      { name: 'northwind-agreement-redlines.md', size: '24kb', type: 'Vector index' },
                      { name: 'investor-presentation-q4.pdf', size: '4.8mb', type: 'Semantic chunked' },
                      { name: 'competitor-pricing-scan.xlsx', size: '112kb', type: 'Auto-linked graph' },
                    ].map((doc) => (
                      <div key={doc.name} className="flex items-center justify-between rounded-lg border border-[var(--dash-border)] bg-[var(--dash-card-solid)] p-2 text-xs">
                        <div className="flex items-center gap-2 min-w-0">
                          <FileText className="h-3.5 w-3.5 text-orange-400/80 shrink-0" />
                          <span className="text-[11.5px] font-medium text-[var(--dash-text-strong)] truncate">{doc.name}</span>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-[9px] text-[var(--dash-muted)]">{doc.size}</span>
                          <span className="text-[9px] px-1.5 py-0.5 rounded bg-orange-500/5 text-orange-400 border border-orange-500/10 uppercase tracking-wide font-semibold">{doc.type}</span>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Lock status callout */}
                  <div className="mt-3 rounded-lg border border-emerald-500/10 bg-emerald-500/5 p-2.5 text-[11px] text-emerald-400 leading-normal flex items-start gap-2">
                    <CheckCircle2 className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                    <span>SecondBrain vault operates under zero-leak policy. Data is isolated per workspace, never uploaded to public LLMs, and never used for training.</span>
                  </div>
                </div>
              )}

              {activePrinciple === 1 && (
                <div className="flex-1 flex flex-col justify-between animate-[fade-in_0.3s_ease-out]">
                  {/* Named Squad Agents Header */}
                  <div className="flex items-center justify-between border-b border-[var(--dash-border)] pb-3 mb-3">
                    <div className="flex items-center gap-2">
                      <Bot className="h-4 w-4 text-sky-400" />
                      <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--dash-text-strong)]">Jordan's Active Squad</span>
                    </div>
                    <span className="flex items-center gap-1 rounded-full bg-sky-500/10 border border-sky-500/20 px-2 py-0.5 text-[9px] text-sky-400 font-medium">
                      <span className="h-1.5 w-1.5 rounded-full bg-sky-400 animate-pulse" /> 3 Running
                    </span>
                  </div>

                  {/* Agent details */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 flex-1 items-center">
                    {[
                      { name: 'Ranger', role: 'Scout', task: 'Scanning competitor blogs', accent: '#38bdf8' },
                      { name: 'Sage', role: 'Synthesist', task: 'Writing SWOT report', accent: '#a78bfa' },
                      { name: 'Sherlock', role: 'Researcher', task: 'Validating key assumptions', accent: '#f472b6' },
                    ].map((agent) => (
                      <div key={agent.name} className="rounded-xl border p-3 text-center transition-all duration-300"
                        style={{ borderColor: `${agent.accent}33`, background: `${agent.accent}0a` }}>
                        <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg border text-xs font-bold uppercase tracking-wider mb-2"
                          style={{ borderColor: `${agent.accent}55`, background: `${agent.accent}15`, color: agent.accent }}>
                          {agent.name[0]}
                        </span>
                        <h5 className="text-xs font-semibold text-[var(--dash-text-strong)]">{agent.name}</h5>
                        <span className="text-[9px] font-bold tracking-wider uppercase" style={{ color: agent.accent }}>{agent.role}</span>
                        <p className="text-[9.5px] text-[var(--dash-muted)] mt-1.5 leading-tight">{agent.task}</p>
                      </div>
                    ))}
                  </div>

                  {/* Stats Callout */}
                  <div className="mt-3 rounded-lg border border-[var(--dash-border)] bg-[var(--dash-card-solid)] p-2.5 text-[11px] text-[var(--dash-text)] leading-normal flex items-center justify-between">
                    <span className="text-[var(--dash-muted)]">Active Squad Skills equipped</span>
                    <strong className="text-orange-400">14 Specializations</strong>
                  </div>
                </div>
              )}

              {activePrinciple === 2 && (
                <div className="flex-1 flex flex-col justify-between animate-[fade-in_0.3s_ease-out]">
                  {/* Mission Orchestrator Header */}
                  <div className="flex items-center justify-between border-b border-[var(--dash-border)] pb-3 mb-3">
                    <div className="flex items-center gap-2">
                      <Network className="h-4 w-4 text-purple-400" />
                      <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--dash-text-strong)]">Mission Orchestrator</span>
                    </div>
                    <span className="flex items-center gap-1 rounded-full bg-purple-500/10 border border-purple-500/20 px-2 py-0.5 text-[9px] text-purple-400 font-medium">
                      Task Graph
                    </span>
                  </div>

                  {/* Workflow steps */}
                  <div className="space-y-2.5 flex-1">
                    <div className="rounded-lg border border-purple-500/20 bg-purple-500/5 p-2 text-xs flex items-center justify-between">
                      <span className="font-semibold text-purple-400">Objective:</span>
                      <span className="text-[11px] text-[var(--dash-text-strong)] font-mono truncate">Map competitor prices & alert Telegram</span>
                    </div>

                    <div className="space-y-1.5 pl-2">
                      {[
                        { task: 'Ingest and read 6 pricing PDFs from vault', status: 'done', label: 'Ranger ✓' },
                        { task: 'Compare rates and identify price hikes', status: 'running', label: 'Sage is working...' },
                        { task: 'Validate anomalies and alert Slack/Telegram', status: 'pending', label: 'Sentinel queued' },
                      ].map((item, idx) => (
                        <div key={idx} className="flex items-center justify-between text-xs py-1 border-b border-[var(--dash-border)] last:border-0">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className={`h-1.5 w-1.5 rounded-full ${
                              item.status === 'done' ? 'bg-emerald-400' : item.status === 'running' ? 'bg-purple-400 animate-pulse' : 'bg-[var(--dash-subtle)]'
                            }`} />
                            <span className={`text-[11px] truncate ${item.status === 'done' ? 'text-[var(--dash-muted)] line-through' : 'text-[var(--dash-text-strong)]'}`}>
                              {item.task}
                            </span>
                          </div>
                          <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded ${
                            item.status === 'done' ? 'bg-emerald-500/10 text-emerald-400' : item.status === 'running' ? 'bg-purple-500/10 text-purple-400' : 'bg-transparent text-[var(--dash-subtle)]'
                          }`}>{item.label}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Controls */}
                  <div className="mt-3 flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-[10px] text-[var(--dash-muted)]">
                      <Terminal className="h-3.5 w-3.5" />
                      <span>Execution graph verified</span>
                    </div>
                    <button className="rounded-lg bg-purple-500 hover:bg-purple-600 text-white text-[10.5px] font-semibold px-3 py-1.5 transition-all duration-200 shadow-[0_4px_12px_rgba(168,85,247,0.3)]">
                      Approve & Run
                    </button>
                  </div>
                </div>
              )}

              {activePrinciple === 3 && (
                <div className="flex-1 flex flex-col justify-between animate-[fade-in_0.3s_ease-out]">
                  {/* Cited & Delivered Header */}
                  <div className="flex items-center justify-between border-b border-[var(--dash-border)] pb-3 mb-3">
                    <div className="flex items-center gap-2">
                      <MessageCircle className="h-4 w-4 text-emerald-400" />
                      <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--dash-text-strong)]">Telegram Delivery Preview</span>
                    </div>
                    <span className="text-[9px] text-[var(--dash-muted)]">Live 12:45 PM</span>
                  </div>

                  {/* Message preview bubble */}
                  <div className="flex-1 flex flex-col justify-center">
                    <div className="rounded-2xl rounded-tl-none border border-[var(--dash-border)] bg-[var(--dash-card-strong)] p-3.5 text-xs max-w-[90%] shadow-sm">
                      <p className="leading-relaxed text-[var(--dash-text-strong)]">
                        📊 <strong>Competitor Price Watcher</strong> report completed:
                        <br />
                        - Acme Co. bumped SaaS base price to $49/mo <code>[1]</code>.
                        <br />
                        - Beta Co. introduced a custom enterprise tier <code>[2]</code>.
                      </p>
                      <div className="mt-2.5 pt-2 border-t border-[var(--dash-border)] flex flex-wrap gap-1.5">
                        <span className="text-[9px] font-mono bg-orange-500/5 text-orange-400 border border-orange-500/10 rounded px-1.5 py-0.5">
                          [1] [[acme_tier_upgrade]]
                        </span>
                        <span className="text-[9px] font-mono bg-orange-500/5 text-orange-400 border border-orange-500/10 rounded px-1.5 py-0.5">
                          [2] [[beta_announcements]]
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Citation footer explanation */}
                  <div className="mt-3 rounded-lg bg-[var(--dash-card-solid)] border border-[var(--dash-border)] p-2.5 text-[11px] text-[var(--dash-muted)] leading-normal flex items-start gap-2">
                    <span className="text-emerald-400 font-bold shrink-0 uppercase text-[9px] bg-emerald-500/10 px-1 rounded">CITED</span>
                    <span>Every report links back directly to the source pages in your vault. No hallucinations, ever.</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* SecondBrain loop */}
      <section className="relative py-12 md:py-20 overflow-hidden">
        <div className="absolute inset-0 grid-bg opacity-35" />
        <div className="relative mx-auto max-w-7xl px-4 md:px-6">
          <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4 md:gap-6 mb-7 md:mb-14">
            <div>
              <p className="type-mono-xs text-[var(--text-muted)] tracking-widest mb-3">
                THE LOOP
              </p>
              <h2 className="text-[1.9rem] md:text-6xl font-semibold tracking-tight leading-tight text-[var(--text-primary)]">
                From source
                <span className="block brushed-text">to squad mission.</span>
              </h2>
            </div>
            <p className="max-w-md text-sm md:text-base leading-6 md:leading-8 text-[var(--text-secondary)]">
              Capture what matters, structure it into memory, equip your named agents with specialist skills, then hand them a goal — cited results delivered to your inbox.
            </p>
          </div>

          <div className="relative">
            <div className="sb-dashboard sb-dashboard--inline sb-dashboard-clean">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3 md:gap-4 relative z-[1]">
                {FLOW.map((item, i) => (
                  <FlowCard key={item.code} item={item} i={i} />
                ))}
              </div>
            </div>
          </div>
        </div>

        <style jsx>{`
          :global(.flow-card) {
            animation: flow-rise 0.8s var(--ease-out-expo) both;
          }
          :global(.flow-node) {
            width: 10px;
            height: 10px;
            border-radius: 999px;
            background: var(--accent);
            box-shadow: 0 0 0 4px color-mix(in srgb, var(--accent) 10%, transparent), 0 0 18px var(--accent);
            animation: flow-pulse 2.8s ease-in-out infinite;
          }
          @keyframes flow-pulse {
            0%, 100% { transform: scale(1); opacity: 0.85; }
            50% { transform: scale(0.72); opacity: 0.45; }
          }
          @keyframes flow-rise {
            from { opacity: 0; transform: translateY(18px); }
            to { opacity: 1; transform: translateY(0); }
          }
          @keyframes slide-in-loop {
            0% { transform: translateY(24px); opacity: 0; }
            12% { transform: translateY(0); opacity: 1; }
            45% { transform: translateY(0); opacity: 1; }
            57% { transform: translateY(-24px); opacity: 0; }
            100% { transform: translateY(-24px); opacity: 0; }
          }
          @keyframes flow-dot-x {
            0% { left: 0%; opacity: 0; }
            15% { opacity: 1; }
            85% { opacity: 1; }
            100% { left: 100%; opacity: 0; }
          }
          @keyframes pulse-scale {
            0%, 100% { transform: scale(1); }
            50% { transform: scale(1.1); }
          }
          @keyframes fade-pulse {
            0%, 100% { opacity: 0.82; transform: scale(0.98); }
            50% { opacity: 1; transform: scale(1.02); }
          }
          @keyframes ingest-progress {
            0% { width: 0%; }
            50%, 100% { width: 100%; }
          }
          @keyframes ingest-check {
            0%, 48% { opacity: 0; transform: scale(0.85); }
            52%, 92% { opacity: 1; transform: scale(1); }
            96%, 100% { opacity: 0; transform: scale(0.85); }
          }
          @keyframes ingest-file {
            0% { transform: translateY(-8px); opacity: 0; }
            12%, 88% { transform: translateY(0); opacity: 1; }
            96%, 100% { transform: translateY(8px); opacity: 0; }
          }
          @keyframes draw-connector-line {
            0% { stroke-dashoffset: 20; stroke-dasharray: 20; opacity: 0; }
            35%, 85% { stroke-dashoffset: 0; stroke-dasharray: 20; opacity: 1; }
            95%, 100% { opacity: 0; }
          }
          @keyframes node-active {
            0%, 30% { border-color: var(--dash-border); background: transparent; transform: scale(1); }
            40%, 85% { border-color: inherit; background: color-mix(in srgb, currentColor 8%, transparent); transform: scale(1.04); }
            95%, 100% { border-color: var(--dash-border); background: transparent; transform: scale(1); }
          }
          @keyframes travel-left-branch {
            0% { cx: 80; cy: 24; opacity: 0; }
            10% { opacity: 1; }
            40% { cx: 40; cy: 48; opacity: 1; }
            45%, 100% { opacity: 0; }
          }
          @keyframes travel-right-branch {
            0% { cx: 80; cy: 24; opacity: 0; }
            10% { opacity: 1; }
            40% { cx: 120; cy: 48; opacity: 1; }
            45%, 100% { opacity: 0; }
          }
          @keyframes subagent-active-left {
            0%, 40% { border-color: var(--dash-border); background: transparent; transform: scale(1); }
            45%, 85% { border-color: currentColor; background: color-mix(in srgb, #38bdf8 12%, transparent); transform: scale(1.08); }
            95%, 100% { border-color: var(--dash-border); background: transparent; transform: scale(1); }
          }
          @keyframes subagent-active-right {
            0%, 40% { border-color: var(--dash-border); background: transparent; transform: scale(1); }
            45%, 85% { border-color: currentColor; background: color-mix(in srgb, #f472b6 12%, transparent); transform: scale(1.08); }
            95%, 100% { border-color: var(--dash-border); background: transparent; transform: scale(1); }
          }
          @keyframes pop-in {
            0% { transform: scale(0.96); opacity: 0; }
            100% { transform: scale(1); opacity: 1; }
          }
        `}</style>
      </section>

      {/* How it works */}
      <section id="how-it-works" className="relative scroll-mt-24 py-12 md:scroll-mt-24 md:py-20">
        <div className="absolute inset-0 dot-bg opacity-40" />
        <div className="max-w-7xl mx-auto px-4 md:px-6 relative">
          <div className="text-center mb-8 md:mb-16">
            <p className="type-mono-xs text-[var(--text-muted)] tracking-widest mb-3">HOW IT WORKS</p>
            <h2 className="type-h2">Three steps from vault to squad mission</h2>
          </div>

          <HowItWorksShowcase />
        </div>
      </section>

      {/* Features — aura 60B860 inspired instrument grid */}
      <PrecisionGrid />

      {/* Vault anatomy */}
      <section className="relative py-12 md:py-20 overflow-hidden">
        <div className="absolute inset-0 dot-bg opacity-25" />
        <div className="relative mx-auto max-w-7xl px-4 md:px-6">
          <div className="grid grid-cols-1 lg:grid-cols-[1.05fr_0.95fr] gap-8 md:gap-10 lg:gap-16 items-center">
            <div>
              <p className="type-mono-xs text-[var(--text-muted)] tracking-widest mb-3">
                VAULT ANATOMY
              </p>
              <h2 className="text-[1.9rem] md:text-6xl font-semibold tracking-tight leading-tight text-[var(--text-primary)]">
                The brain your
                <span className="block brushed-text">squad lives inside.</span>
              </h2>
              <p className="mt-4 md:mt-6 text-sm md:text-base leading-6 md:leading-8 text-[var(--text-secondary)] max-w-xl">
                Source, summary, entities, links, and provenance trail stay together — so agents never work from stale context, and every output they produce is traceable back to your own evidence.
              </p>
            </div>

            <div className="sb-dashboard sb-dashboard--inline sb-dashboard-clean w-full">
              <div
                ref={vaultSpotlight.ref}
                onMouseMove={vaultSpotlight.onMouseMove}
                className="relative rounded-[22px] border border-[var(--dash-border)] overflow-hidden p-2.5 md:p-3 dash-panel dash-grain dash-spotlight dash-interactive"
                style={{
                  boxShadow: 'var(--dash-shadow-lg)',
                }}
              >
                <span className="dash-spotlight-glow" aria-hidden />
                <div className="relative z-[1] rounded-xl overflow-hidden border border-[var(--dash-border)] bg-[var(--dash-card-solid)]">
                  <div
                    className="flex items-center justify-between px-3 md:px-4 py-3 border-b border-[var(--dash-border)]"
                    style={{ background: 'var(--dash-card-solid)' }}
                  >
                    <span className="mono text-[10px] tracking-widest text-[var(--dash-muted)]">
                      SECONDBRAIN / VAULT
                    </span>
                    <span className="mono text-[9px] tracking-widest" style={{ color: 'var(--dash-accent-2)' }}>
                      LIVE
                    </span>
                  </div>
                  <div className="h-[400px]">
                    <VaultAnatomyInteractive />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <style jsx>{`
          .vault-row {
            animation: vault-row-in 0.7s var(--ease-out-expo) both;
            background: color-mix(in srgb, var(--dash-glass) 42%, transparent);
            transition: background 0.3s ease;
          }
          .vault-row:nth-child(even) {
            background: color-mix(in srgb, var(--dash-card-solid) 46%, transparent);
          }
          .vault-row:hover {
            background: color-mix(in srgb, var(--dash-accent-soft) 40%, transparent);
          }
          @keyframes vault-row-in {
            from { opacity: 0; transform: translateX(16px); }
            to { opacity: 1; transform: translateX(0); }
          }
        `}</style>
      </section>

      {/* System model */}
      <section className="py-12 md:py-16 relative overflow-hidden">
        <div className="absolute inset-0 grid-bg opacity-50" />

        <div className="max-w-7xl mx-auto px-4 md:px-6 relative">
          <div className="sb-dashboard sb-dashboard--inline sb-dashboard-clean w-full">
            <div
              ref={systemSpotlight.ref}
              onMouseMove={systemSpotlight.onMouseMove}
              className="relative rounded-[22px] p-4 md:p-8 border border-[var(--dash-border)] overflow-hidden dash-panel dash-grain dash-spotlight dash-interactive"
              style={{ 
                boxShadow: 'var(--dash-shadow-lg)' 
              }}
            >
              <span className="dash-spotlight-glow" aria-hidden />
              <div className="relative z-[1] grid grid-cols-1 lg:grid-cols-[0.72fr_1.28fr] gap-8">
                <div>
                  <div className="flex items-center gap-3 mb-5">
                    <span
                      className="w-2 h-2 rounded-full pulse-dot"
                      style={{ background: 'var(--dash-accent)', boxShadow: '0 0 8px var(--dash-accent)' }}
                    />
                    <span className="type-mono-xs text-[var(--dash-muted)] tracking-widest">SECONDBRAIN OS · LIVE</span>
                  </div>
                  <h2 className="text-[1.9rem] md:text-5xl font-semibold tracking-tight leading-tight text-[var(--dash-text-strong)]">
                    One brain.
                    <span className="block brushed-text">100+ skills. Your squad.</span>
                  </h2>
                  <p className="mt-4 md:mt-5 text-sm md:text-base leading-6 md:leading-8 text-[var(--dash-muted)]">
                    Ingest sources, build cited memory, search the knowledge graph, command named specialist agents, and run multi-agent missions — all in one workspace. Results delivered to your inbox.
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {CAPABILITIES.map(([title, label], i) => (
                    <div
                      key={title}
                      className="rounded-xl p-4 border border-[var(--dash-border)]"
                      style={{
                        background: 'var(--dash-card-solid)',
                      }}
                    >
                      <div className="flex items-center justify-between gap-3 mb-3">
                        <span className="mono text-[9px] tracking-widest text-[var(--dash-muted)]">
                          {label.toUpperCase()}
                        </span>
                        <span
                          className="h-1.5 w-1.5 rounded-full"
                          style={{
                            background: i % 2 === 0 ? 'var(--dash-accent)' : '#c8c8cf',
                            boxShadow: i % 2 === 0 ? '0 0 8px var(--dash-accent)' : 'none',
                          }}
                        />
                      </div>
                      <p className="text-sm leading-6 text-[var(--dash-text)]">
                        {title}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Use cases */}
      <section id="use-cases" className="relative py-12 md:py-16 overflow-hidden">
        <div className="absolute inset-0 dot-bg opacity-25" />
        <div className="relative max-w-7xl mx-auto px-4 md:px-6">
          <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4 md:gap-8 mb-8 md:mb-12">
            <div>
              <p className="type-mono-xs text-[var(--text-muted)] tracking-widest mb-3">
                BUILT FOR REAL WORK
              </p>
              <h2 className="text-[1.9rem] md:text-5xl font-semibold tracking-tight leading-tight text-[var(--text-primary)]">
                Your squad.
                <span className="block brushed-text">Built for your work.</span>
              </h2>
            </div>
            <p className="max-w-2xl text-sm md:text-base leading-6 md:leading-8 text-[var(--text-secondary)]">
              Every squad is different. Equip yours with the skills that match your actual workflows — research, sales, ops, content, finance, or all of the above.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 md:gap-4 sb-dashboard sb-dashboard--inline sb-dashboard-clean">
            {USE_CASES.map((item, i) => (
              <UseCaseCard key={item.title} item={item} i={i} />
            ))}
          </div>
        </div>
      </section>

    {/* Pricing */}
      <section id="pricing" className="scroll-mt-24 py-12 md:scroll-mt-24 md:py-20">
        <div className="max-w-6xl mx-auto px-4 md:px-6">
          <div className="text-center mb-8 md:mb-16">
            <p className="type-mono-xs text-[var(--text-muted)] tracking-widest mb-3">PRICING</p>
            <h2 className="type-h2">Replaces a small team. Costs less than a single freelancer.</h2>
            <p className="text-[var(--text-secondary)] mt-4 text-sm md:text-base max-w-2xl mx-auto">
              One flat early-access price while we onboard the next 100 founders.
            </p>
          </div>

          <div className="max-w-[480px] mx-auto sb-dashboard sb-dashboard--inline sb-dashboard-clean">
            <PricingCard 
              plan={{
                name: 'Squad (Founder Edition)',
                price: '$49',
                originalPrice: '$199',
                period: '/mo',
                subPrice: '+ your AI subscription (ChatGPT recommended · Claude · MiniMax · Z.AI also work)',
                badge: '🔴 ONLY 100 SEATS LEFT',
                desc: 'In one month, your squad replaces:',
                roles: [
                  'a marketing analyst',
                  'a content writer',
                  'a customer researcher',
                  'a project manager',
                  'the SEO contractor',
                  'the ops person you keep meaning to hire'
                ],
                features: [
                  'Personalized onboarding: your lead agent designs your squad with you in Telegram',
                  'Unlimited AI agents. Name them, give them roles, hire or fire whenever',
                  'Shared task board, threads, @-mentions, activity feed',
                  'Telegram-first: talk to your squad lead from anywhere',
                  'Bring your own AI: ChatGPT ($20–$200/mo, recommended) · Claude with Extra Usage · MiniMax · Z.AI',
                  'Dedicated, isolated workspace. Your data stays yours',
                  'Real onboarding · priority support · the founder replies'
                ],
                cta: 'Claim your spot at $49/mo',
                href: '/sign-up?plan=founder',
                highlight: true,
                squad: false,
              }}
            />
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-10 md:py-16 relative overflow-hidden">
        <div className="absolute inset-0 grid-bg opacity-30" />
        <div
          aria-hidden
          className="absolute inset-0"
          style={{
            background:
              'radial-gradient(ellipse 60% 50% at 50% 50%, color-mix(in srgb, var(--accent) 8%, transparent), transparent 70%)',
          }}
        />
        <div className="max-w-3xl mx-auto px-4 md:px-6 text-center relative">
          <p className="type-mono-xs text-[var(--text-muted)] tracking-widest mb-4">GET STARTED · 14-DAY TRIAL</p>
          <h2 className="text-[2rem] md:text-5xl font-semibold mb-4 md:mb-6 leading-tight tracking-tight">
            Your squad is waiting.<br />
            <span className="brushed-text">Build your brain and deploy them.</span>
          </h2>
          <p className="text-[var(--text-secondary)] mb-6 md:mb-10 text-sm md:text-lg leading-6 md:leading-7 max-w-xl mx-auto">
            Drop in your first source today. Name your first agent tomorrow. Get cited answers — not guesses — delivered to your vault or straight to your Telegram.
          </p>
          <Link
            href="/sign-up"
            className="inline-flex w-full sm:w-auto justify-center items-center gap-3 text-sm md:text-base font-semibold px-6 md:px-8 py-3.5 md:py-4 rounded-xl transition-all duration-300 hover:-translate-y-[1px]"
            style={{
              color: 'var(--text-inverse)',
              background: 'linear-gradient(135deg, var(--accent-bright), var(--accent))',
              boxShadow: 'var(--shadow-2)',
            }}
          >
            Start your 14-day trial
              <span className="mono opacity-70">→</span>
          </Link>
          <p className="mt-4 text-[11px] text-[var(--text-muted)] tracking-wide">
            Secure checkout via Stripe. Cancel anytime. Founders rarely do.
          </p>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="relative scroll-mt-24 overflow-hidden py-12 md:scroll-mt-24 md:py-24 group/section">
        <div className="absolute inset-0 -z-10 rounded-full opacity-0 blur-[120px] transition-opacity duration-1000 group-hover/section:opacity-100 bg-[var(--accent)]/5 pointer-events-none" />
        <div className="relative max-w-[68rem] mx-auto px-4 md:px-6">
          <div className="grid grid-cols-1 lg:grid-cols-[0.85fr_1.15fr] gap-8 md:gap-12 lg:gap-20 items-start">
            <div className="lg:sticky lg:top-32 relative">
              <div className="mb-4 md:mb-6">
                <div className="inline-flex items-center gap-2 rounded-full border border-[var(--accent)]/20 bg-[var(--accent)]/5 px-3 py-1 text-xs">
                  <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent)] animate-pulse" />
                  <span className="type-mono tracking-widest text-[var(--accent-bright)] font-semibold">FAQ</span>
                </div>
              </div>
              <h2 className="text-[2rem] md:text-[2.75rem] font-semibold tracking-tight leading-[1.05]">
                Clear answers
                <span 
                  className="block mt-1"
                  style={{
                    background: 'linear-gradient(135deg, var(--accent) 0%, var(--accent-bright) 50%, var(--accent-deep) 100%)',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                    filter: 'drop-shadow(0 2px 8px rgba(255,122,31,0.15))'
                  }}
                >
                  before you start.
                </span>
              </h2>
              <p className="mt-5 text-[1rem] md:text-[1.1rem] leading-[1.65] text-[var(--text-secondary)] max-w-lg">
                The essentials on private vaults, named squad agents, 100+ skills, mission orchestration, and why agents with a brain are different from agents with a task board.
              </p>
            </div>

            <div className="space-y-2.5 md:space-y-3 relative">
              {FAQS.map((item, i) => (
                <FAQAccordionItem key={item.q} item={item} i={i} />
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <Testimonials />

      {/* Footer — DD146-inspired scroll reveal wordmark */}
      <SiteFooter />
    </div>
  )
}
