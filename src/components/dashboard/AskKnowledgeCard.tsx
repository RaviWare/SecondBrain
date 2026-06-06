'use client'

import { useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { ArrowRight, ChevronDown, FileUp, Link2, Mic, NotebookPen, Plus, Sparkles } from 'lucide-react'
import { suggestedQuestions } from '@/lib/dashboard-data'
import { useTypewriter } from '@/lib/use-typewriter'
import { useSpotlight } from '@/lib/use-spotlight'
import { MandalaCore } from '@/components/dashboard/MandalaCore'
import { useDashboardData } from '@/components/dashboard/DashboardData'

const addOptions = [
  { label: 'Add note', href: '/app/ingest?type=note', icon: NotebookPen },
  { label: 'Upload PDF', href: '/app/ingest?type=file', icon: FileUp },
  { label: 'Save link', href: '/app/ingest?type=url', icon: Link2 },
  { label: 'Import transcript', href: '/app/ingest?type=transcript', icon: Mic },
]

export function TopActions() {
  const [open, setOpen] = useState(false)
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const openMenu = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current)
    setOpen(true)
  }
  // Small grace delay so moving the cursor from the button to the menu
  // (across the gap) doesn't flicker it closed.
  const scheduleClose = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current)
    closeTimer.current = setTimeout(() => setOpen(false), 140)
  }

  return (
    <div
      className="relative"
      onMouseEnter={openMenu}
      onMouseLeave={scheduleClose}
    >
      <button
        type="button"
        onClick={() => setOpen(value => !value)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="dash-accent-grad relative inline-flex h-11 items-center justify-center gap-2 overflow-hidden rounded-2xl px-5 text-sm font-semibold text-white shadow-[0_16px_36px_-10px_rgba(255,102,0,0.6)] transition hover:-translate-y-0.5"
      >
        <span className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.35),transparent_45%)]" />
        <Plus className="relative h-4 w-4" />
        <span className="relative">Add</span>
        <ChevronDown className={`relative h-4 w-4 transition-transform duration-300 ${open ? 'rotate-180' : ''}`} />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.96 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            onMouseEnter={openMenu}
            onMouseLeave={scheduleClose}
            role="menu"
            className="dash-menu absolute right-0 top-12 z-50 w-52 overflow-hidden rounded-2xl p-2"
          >
            {/* hover bridge — covers the gap between button and menu so the
                cursor never crosses dead space and closes the menu */}
            <span className="absolute -top-2 left-0 right-0 h-2" aria-hidden />
            {addOptions.map(({ label, href, icon: Icon }, i) => (
              <motion.div
                key={label}
                initial={{ opacity: 0, x: -6 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.04 + i * 0.05, duration: 0.22 }}
              >
                <Link
                  href={href}
                  onClick={() => setOpen(false)}
                  role="menuitem"
                  className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm text-[var(--dash-text)] transition hover:bg-[var(--dash-soft)]"
                >
                  <span className="grid h-7 w-7 place-items-center rounded-lg border border-[var(--dash-border)] bg-[var(--dash-soft)] text-[var(--dash-accent)]">
                    <Icon className="h-3.5 w-3.5" />
                  </span>
                  {label}
                </Link>
              </motion.div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

const placeholderPrompts = [
  'What did we decide about pricing?',
  'Summarize my GTM strategy',
  'What do customer calls say about onboarding?',
  'Show research on AI note-taking tools',
  'List risks mentioned across my notes',
]

export function AskKnowledgeCard() {
  const [question, setQuestion] = useState('')
  const [focused, setFocused] = useState(false)
  const router = useRouter()
  const reduceMotion = useReducedMotion()
  const spotlight = useSpotlight<HTMLElement>()
  const { data } = useDashboardData()

  // Seed the "Try asking" chips from the user's REAL top topics when the vault has
  // any — a question grounded in their own knowledge beats a generic example. Falls
  // back to the generic starter prompts only for an empty/new vault (honest: we never
  // present a fabricated topic as if it were theirs).
  const realTopics = (data?.topTopics ?? []).slice(0, 4).map((t) => `What do my notes say about ${t.title}?`)
  const prompts = realTopics.length > 0 ? realTopics : suggestedQuestions

  // Typewriter runs only when the user hasn't focused or typed anything.
  const typewriterActive = !focused && question.length === 0
  const typed = useTypewriter(placeholderPrompts, { enabled: typewriterActive })

  const ask = () => {
    const q = question.trim()
    router.push(q ? `/app/query?q=${encodeURIComponent(q)}` : '/app/query')
  }

  return (
    <section
      ref={spotlight.ref}
      onMouseMove={spotlight.onMouseMove}
      className="dash-panel dash-panel-strong dash-grain dash-spotlight relative overflow-hidden p-5 lg:p-6"
    >
      <span className="dash-spotlight-glow" aria-hidden />
      {/* aura glow — gentle drift */}
      <motion.div
        aria-hidden
        className="pointer-events-none absolute -right-12 -top-20 h-56 w-56 rounded-full bg-[radial-gradient(circle,var(--dash-accent-soft),transparent_70%)] blur-2xl"
        animate={reduceMotion ? undefined : { opacity: [0.55, 0.95, 0.55], scale: [1, 1.12, 1] }}
        transition={{ duration: 7, repeat: Infinity, ease: 'easeInOut' }}
      />

      <div className="relative flex flex-col gap-5 lg:flex-row lg:items-center lg:gap-6">
        <div className="min-w-0 flex-1">
          <motion.span
            initial={reduceMotion ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
            className="dash-inset inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--dash-accent)]"
          >
            <motion.span
              animate={reduceMotion ? undefined : { rotate: [0, 12, -8, 0], scale: [1, 1.15, 1] }}
              transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
            >
              <Sparkles className="h-3 w-3" />
            </motion.span>
            AI memory
          </motion.span>
          <h2 className="mt-2.5 text-lg font-semibold tracking-tight text-[var(--dash-text-strong)] 2xl:text-xl">
            Ask anything from your knowledge
          </h2>
          <p className="mt-1 text-[13px] text-[var(--dash-muted)]">
            Get answers from your sources with citations.
          </p>

          <motion.form
            onSubmit={event => {
              event.preventDefault()
              ask()
            }}
            animate={
              reduceMotion
                ? undefined
                : focused
                  ? { boxShadow: '0 0 0 3px var(--dash-accent-soft), var(--dash-shadow-md)' }
                  : { boxShadow: '0 0 0 0px transparent, var(--dash-shadow-sm)' }
            }
            transition={{ duration: 0.3, ease: 'easeOut' }}
            className={`mt-4 flex items-center gap-2 rounded-xl border bg-[var(--dash-card-strong)] p-1.5 backdrop-blur ${
              focused ? 'border-[var(--dash-border-glow)]' : 'border-[var(--dash-border)]'
            }`}
          >
            <div className="relative min-w-0 flex-1">
              {/* Animated typewriter placeholder overlay */}
              {typewriterActive && (
                <div
                  aria-hidden
                  className="pointer-events-none absolute inset-0 flex items-center gap-1.5 px-3 text-sm"
                >
                  <span className="shrink-0 text-[var(--dash-subtle)]">Ask</span>
                  <span className="min-w-0 truncate text-[var(--dash-text)]">
                    {typed}
                    <motion.span
                      className="ml-px inline-block h-[1.1em] w-[2px] translate-y-[2px] rounded-full bg-[var(--dash-accent)] align-middle shadow-[0_0_8px_var(--dash-accent)]"
                      animate={reduceMotion ? undefined : { opacity: [1, 1, 0, 0] }}
                      transition={{ duration: 1, repeat: Infinity, ease: 'linear', times: [0, 0.5, 0.5, 1] }}
                    />
                  </span>
                </div>
              )}
              <input
                value={question}
                onChange={event => setQuestion(event.target.value)}
                onFocus={() => setFocused(true)}
                onBlur={() => setFocused(false)}
                aria-label="Ask a question about your knowledge"
                placeholder={typewriterActive ? '' : 'Ask a question about your notes, docs, research...'}
                className="w-full bg-transparent px-3 text-sm text-[var(--dash-text)] outline-none placeholder:text-[var(--dash-subtle)]"
              />
            </div>
            <motion.button
              type="submit"
              aria-label="Ask question"
              whileHover={reduceMotion ? undefined : { scale: 1.08 }}
              whileTap={reduceMotion ? undefined : { scale: 0.94 }}
              className="dash-accent-grad relative grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-xl text-white shadow-[0_12px_28px_-6px_rgba(255,102,0,0.6)]"
            >
              <span className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.4),transparent_50%)]" />
              <ArrowRight className="relative h-4 w-4" />
            </motion.button>
          </motion.form>

          <p className="mt-4 text-[11px] font-medium text-[var(--dash-muted)]">Try asking:</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {prompts.map((prompt, i) => (
              <motion.button
                key={prompt}
                type="button"
                onClick={() => {
                  setQuestion(prompt)
                  setFocused(true)
                }}
                initial={reduceMotion ? false : { opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5 + i * 0.08, duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                whileHover={reduceMotion ? undefined : { y: -2 }}
                whileTap={reduceMotion ? undefined : { scale: 0.96 }}
                className="dash-inset inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium text-[var(--dash-text)] transition-colors hover:border-[var(--dash-border-glow)] hover:text-[var(--dash-accent)]"
              >
                <Sparkles className="h-3 w-3 text-[var(--dash-accent)]" />
                {prompt}
              </motion.button>
            ))}
          </div>
        </div>

        <div className="hidden shrink-0 lg:flex lg:items-center lg:justify-center">
          <MandalaCore />
        </div>
      </div>
    </section>
  )
}
