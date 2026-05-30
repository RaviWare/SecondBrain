'use client'

const items = [
  'AI SECOND BRAIN FOR FOUNDERS',
  'CITED RESEARCH KNOWLEDGE BASE',
  'PRIVATE MEMORY VAULT',
  'CUSTOMER CALL RECALL',
  'MARKET RESEARCH COMPANION',
  'LINKED NOTE NETWORK',
  'LIVING KNOWLEDGE GRAPH',
  'SOURCE-BACKED AI ANSWERS',
  'PRODUCT DECISION MEMORY',
  'TEAM WIKI THAT MAINTAINS ITSELF',
  'NOTES, PDFS, LINKS, TRANSCRIPTS',
  'ALWAYS-ON PERSONAL KNOWLEDGE OS',
]

export function Ticker() {
  return (
    <div className="overflow-hidden border-y border-[var(--border)] bg-[color-mix(in_srgb,var(--surface)_42%,transparent)] py-2 md:py-2.5">
      <div className="flex gap-8 whitespace-nowrap animate-[ticker_42s_linear_infinite] md:gap-12">
        {[...items, ...items, ...items].map((item, i) => (
          <span key={i} className="mono flex shrink-0 items-center gap-2.5 text-[10px] uppercase tracking-[0.18em] text-[var(--text-muted)] md:gap-3 md:text-xs md:tracking-widest">
            <span
              className="pulse-dot inline-block h-1 w-1 rounded-full"
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
