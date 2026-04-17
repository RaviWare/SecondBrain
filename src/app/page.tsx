import Link from 'next/link'
import { Brain, Zap, BookOpen, MessageSquare, ArrowRight, Check } from 'lucide-react'

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      {/* Nav */}
      <nav className="flex items-center justify-between px-8 py-5 border-b border-zinc-900 max-w-7xl mx-auto">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-violet-600 flex items-center justify-center">
            <Brain className="w-4 h-4 text-white" />
          </div>
          <span className="font-semibold text-sm tracking-tight">Second Brain</span>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/sign-in" className="text-sm text-zinc-400 hover:text-zinc-100 transition-colors px-3 py-2">
            Sign in
          </Link>
          <Link href="/sign-up" className="text-sm bg-violet-600 hover:bg-violet-500 text-white px-4 py-2 rounded-lg transition-colors font-medium">
            Get started free
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <section className="px-8 py-24 text-center max-w-4xl mx-auto">
        <div className="inline-flex items-center gap-2 bg-violet-600/10 border border-violet-500/20 text-violet-300 text-xs px-3 py-1.5 rounded-full mb-8 font-medium">
          <Zap className="w-3 h-3" />
          Powered by Claude AI
        </div>
        <h1 className="text-5xl font-bold text-zinc-100 mb-6 leading-tight tracking-tight">
          Your AI that builds your<br />
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-violet-400 to-blue-400">
            knowledge base for you
          </span>
        </h1>
        <p className="text-zinc-400 text-lg mb-10 max-w-2xl mx-auto leading-relaxed">
          Ingest any URL, article, or document. Claude reads it, writes structured wiki pages, cross-links related concepts, and maintains your personal knowledge graph — automatically.
        </p>
        <div className="flex items-center justify-center gap-4">
          <Link href="/sign-up"
            className="flex items-center gap-2 bg-violet-600 hover:bg-violet-500 text-white px-6 py-3.5 rounded-xl font-medium transition-colors text-sm">
            Start for free
            <ArrowRight className="w-4 h-4" />
          </Link>
          <Link href="/sign-in" className="text-sm text-zinc-500 hover:text-zinc-300 transition-colors">
            Sign in →
          </Link>
        </div>
        <p className="text-xs text-zinc-600 mt-4">No credit card required · 25 free ingests per month</p>
      </section>

      {/* How it works */}
      <section className="px-8 py-16 max-w-5xl mx-auto">
        <h2 className="text-center text-2xl font-bold text-zinc-100 mb-12">How it works</h2>
        <div className="grid grid-cols-3 gap-6">
          {[
            { icon: Zap,           step: '01', title: 'Ingest a source',        desc: 'Paste a URL or drop in text. We fetch and clean the content automatically.' },
            { icon: Brain,         step: '02', title: 'Claude builds the wiki',  desc: 'Claude reads the source, writes structured pages, and cross-links related concepts.' },
            { icon: MessageSquare, step: '03', title: 'Query your knowledge',    desc: 'Ask any question. Get cited answers sourced from your personal wiki.' },
          ].map(({ icon: Icon, step, title, desc }) => (
            <div key={step} className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-8 h-8 rounded-lg bg-violet-600/20 flex items-center justify-center">
                  <Icon className="w-4 h-4 text-violet-400" />
                </div>
                <span className="text-xs font-mono text-zinc-600">{step}</span>
              </div>
              <h3 className="font-semibold text-zinc-200 mb-2 text-sm">{title}</h3>
              <p className="text-zinc-500 text-sm leading-relaxed">{desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section className="px-8 py-16 max-w-5xl mx-auto">
        <div className="grid grid-cols-2 gap-6">
          {[
            { icon: BookOpen,      color: 'text-violet-400', from: 'from-violet-600/10', border: 'border-violet-500/20', title: 'Wikipedia-style wiki',   desc: 'Every source becomes structured wiki pages — source summaries, concepts, entities, and synthesis. Fully searchable, with backlinks.' },
            { icon: MessageSquare, color: 'text-blue-400',   from: 'from-blue-600/10',   border: 'border-blue-500/20',   title: 'Cited AI answers',        desc: 'Every answer cites the specific wiki pages it used. No hallucinations — only what you\'ve ingested.' },
            { icon: Zap,           color: 'text-emerald-400',from: 'from-emerald-600/10',border: 'border-emerald-500/20',title: 'Auto cross-linking',       desc: 'When you ingest a new source, Claude automatically updates related pages and creates backlinks — your knowledge compounds.' },
            { icon: Brain,         color: 'text-amber-400',  from: 'from-amber-600/10',  border: 'border-amber-500/20',  title: 'Your data, your control', desc: 'Edit any wiki page manually. Export your entire vault as markdown. Your knowledge base is yours.' },
          ].map(({ icon: Icon, color, from, border, title, desc }) => (
            <div key={title} className={`bg-gradient-to-br ${from} to-transparent border ${border} rounded-2xl p-8`}>
              <Icon className={`w-6 h-6 ${color} mb-4`} />
              <h3 className="text-lg font-semibold text-zinc-100 mb-2">{title}</h3>
              <p className="text-zinc-400 text-sm leading-relaxed">{desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Pricing */}
      <section className="px-8 py-16 max-w-3xl mx-auto text-center">
        <h2 className="text-2xl font-bold text-zinc-100 mb-3">Simple pricing</h2>
        <p className="text-zinc-500 text-sm mb-12">Start free, upgrade when you need more</p>
        <div className="grid grid-cols-2 gap-4 text-left">
          {[
            { name: 'Free', price: '$0',  period: 'forever',  features: ['25 ingests / month', '50 queries / month', '1 vault', 'URL + text ingestion', 'Full wiki reader'], cta: 'Get started free', href: '/sign-up', highlight: false },
            { name: 'Pro',  price: '$18', period: '/month',   features: ['Unlimited ingests', 'Unlimited queries', '3 vaults', 'Claude Sonnet 4.6', 'Priority support', 'Vault export'], cta: 'Start Pro', href: '/sign-up', highlight: true },
          ].map(plan => (
            <div key={plan.name} className={`rounded-2xl p-6 border ${plan.highlight ? 'border-violet-500/40 bg-violet-600/5' : 'border-zinc-800 bg-zinc-900'}`}>
              <p className={`text-sm font-semibold mb-1 ${plan.highlight ? 'text-violet-300' : 'text-zinc-300'}`}>{plan.name}</p>
              <p className="text-3xl font-bold text-zinc-100 mb-0.5">{plan.price}</p>
              <p className="text-xs text-zinc-600 mb-6">{plan.period}</p>
              <ul className="space-y-2 mb-6">
                {plan.features.map(f => (
                  <li key={f} className="flex items-center gap-2 text-sm text-zinc-400">
                    <Check className={`w-3.5 h-3.5 ${plan.highlight ? 'text-violet-400' : 'text-zinc-600'}`} />
                    {f}
                  </li>
                ))}
              </ul>
              <Link href={plan.href} className={`block text-center text-sm font-medium py-2.5 rounded-xl transition-colors ${
                plan.highlight ? 'bg-violet-600 hover:bg-violet-500 text-white' : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-300'}`}>
                {plan.cta}
              </Link>
            </div>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-zinc-900 px-8 py-8 text-center">
        <p className="text-xs text-zinc-700">Built with Claude AI · © 2026 Second Brain</p>
      </footer>
    </div>
  )
}
