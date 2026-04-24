'use client'

const items = [
  'KNOWLEDGE GRAPH ACTIVE', 'AI PROCESSING', 'WIKI NODES: 0',
  'CLAUDE HAIKU ONLINE', 'MONGODB ATLAS CONNECTED', 'VECTOR SEARCH READY',
  'SECOND BRAIN INITIALIZED', 'INGEST PIPELINE READY', 'QUERY ENGINE ONLINE',
]

export function Ticker() {
  return (
    <div className="overflow-hidden border-y border-white/5 py-2 md:py-2.5 bg-black/20">
      <div className="flex gap-8 md:gap-12 animate-[ticker_30s_linear_infinite] whitespace-nowrap">
        {[...items, ...items, ...items].map((item, i) => (
          <span key={i} className="flex items-center gap-2.5 md:gap-3 mono text-[10px] md:text-xs tracking-[0.2em] md:tracking-widest text-white/20 uppercase shrink-0">
            <span
              className="w-1 h-1 rounded-full inline-block pulse-dot"
              style={{ background: 'var(--accent)', boxShadow: '0 0 6px var(--accent)' }}
            />
            {item}
          </span>
        ))}
      </div>
      <style>{`
        @keyframes ticker {
          from { transform: translateX(0); }
          to { transform: translateX(-33.33%); }
        }
      `}</style>
    </div>
  )
}
