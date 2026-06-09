'use client'

import { useState, useEffect } from 'react'
import { Inbox, FileText, Network, Brain, Database, Activity, Zap } from 'lucide-react'

const LAYERS = [
  { id: 'raw', name: 'Raw Sources', desc: 'Immutable evidence inbox. URLs, PDFs, transcripts.', icon: Inbox, accent: '#ff7a1f' },
  { id: 'summaries', name: 'Source Summaries', desc: 'One structured page per ingested item.', icon: FileText, accent: '#38bdf8' },
  { id: 'concepts', name: 'Concepts & Entities', desc: 'People, products, ideas, methods mapped.', icon: Network, accent: '#a78bfa' },
  { id: 'patterns', name: 'Patterns & Synthesis', desc: 'Cross-source understanding.', icon: Brain, accent: '#f472b6' },
  { id: 'log', name: 'Operation Log', desc: 'Every ingest and query recorded immutably.', icon: Database, accent: '#34d399' },
]

export function VaultAnatomyInteractive() {
  const [activeLayer, setActiveLayer] = useState(0)
  const [userInteracted, setUserInteracted] = useState(false)

  // Auto cycle
  useEffect(() => {
    if (userInteracted) return
    const interval = setInterval(() => {
      setActiveLayer(prev => (prev + 1) % LAYERS.length)
    }, 4000)
    return () => clearInterval(interval)
  }, [userInteracted])

  return (
    <div className="grid grid-cols-1 md:grid-cols-[220px_1fr] gap-4 h-full p-1.5 md:p-3">
      {/* Left List */}
      <div className="flex flex-col gap-2">
        {LAYERS.map((layer, idx) => {
          const Icon = layer.icon
          const isActive = idx === activeLayer
          return (
            <button
              key={layer.id}
              onClick={() => {
                setActiveLayer(idx)
                setUserInteracted(true)
              }}
              className="group flex items-center gap-3 rounded-xl border p-3 text-left transition-all duration-300 relative overflow-hidden"
              style={{
                borderColor: isActive ? `${layer.accent}55` : 'var(--dash-border)',
                background: isActive ? `${layer.accent}14` : 'var(--dash-card-solid)',
              }}
            >
              {isActive && (
                <div 
                  className="absolute left-0 top-0 bottom-0 w-1 transition-all duration-500"
                  style={{ background: layer.accent, boxShadow: `0 0 10px ${layer.accent}` }}
                />
              )}
              <div 
                className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border transition-all duration-300 group-hover:scale-110"
                style={{ 
                  borderColor: isActive ? `${layer.accent}88` : 'var(--dash-border)', 
                  background: isActive ? `${layer.accent}22` : 'rgba(255,255,255,0.02)',
                  color: isActive ? layer.accent : 'var(--dash-muted)' 
                }}
              >
                <Icon className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[12px] font-semibold transition-colors duration-300 truncate" style={{ color: isActive ? 'var(--dash-text-strong)' : 'var(--dash-text)' }}>
                  {layer.name}
                </p>
                <p className="text-[10px] leading-tight mt-0.5 transition-colors duration-300" style={{ color: isActive ? `${layer.accent}dd` : 'var(--dash-muted)' }}>
                  {layer.desc}
                </p>
              </div>
            </button>
          )
        })}
      </div>

      {/* Right Visualization Area */}
      <div className="rounded-xl border border-[var(--dash-border)] bg-[var(--dash-card-solid)] p-4 relative overflow-hidden flex flex-col items-center justify-center min-h-[300px]">
         {/* Background ambient glow based on active layer */}
         <div 
           className="absolute inset-0 opacity-[0.15] blur-[60px] transition-colors duration-1000"
           style={{ background: `radial-gradient(circle at 50% 50%, ${LAYERS[activeLayer].accent}, transparent 70%)` }}
         />
         
         <div className="relative z-10 w-full h-full flex flex-col items-center justify-center">
           {activeLayer === 0 && (
             <div className="animate-[fade-in_0.4s_ease-out] flex flex-col items-center gap-4">
                <div className="relative h-20 w-20 border border-dashed rounded-xl flex items-center justify-center shadow-lg" style={{ borderColor: `${LAYERS[0].accent}88`, background: `${LAYERS[0].accent}11` }}>
                  <Inbox className="h-8 w-8 animate-bounce" style={{ color: LAYERS[0].accent }} />
                  {/* Floating files */}
                  <div className="absolute -top-4 -left-4 p-2 bg-[var(--dash-bg)] border border-[var(--dash-border)] rounded-md shadow-md animate-[float_3s_ease-in-out_infinite]">
                    <FileText className="h-4 w-4 text-[var(--dash-text)]" />
                  </div>
                  <div className="absolute -bottom-4 -right-4 p-2 bg-[var(--dash-bg)] border border-[var(--dash-border)] rounded-md shadow-md animate-[float_3.5s_ease-in-out_infinite_reverse]">
                    <FileText className="h-4 w-4 text-[var(--dash-text)]" />
                  </div>
                </div>
                <div className="text-center">
                  <p className="text-xs font-mono font-bold tracking-wider" style={{ color: LAYERS[0].accent }}>IMMUTABLE INBOX</p>
                  <p className="text-[10px] text-[var(--dash-muted)] mt-1">Accepts PDFs, URLs, Transcripts</p>
                </div>
             </div>
           )}

           {activeLayer === 1 && (
             <div className="animate-[fade-in_0.4s_ease-out] flex flex-col items-center w-full max-w-[240px]">
               <div className="w-full bg-[var(--dash-bg)] border border-[var(--dash-border)] rounded-xl p-4 shadow-xl relative overflow-hidden">
                 <div className="absolute top-0 left-0 right-0 h-1" style={{ background: LAYERS[1].accent }} />
                 <div className="h-2.5 w-1/3 rounded bg-[var(--dash-border-bright)] mb-4 mt-2" />
                 <div className="space-y-2.5">
                   <div className="h-2 w-full rounded bg-[var(--dash-border)]" />
                   <div className="h-2 w-5/6 rounded bg-[var(--dash-border)]" />
                   <div className="h-2 w-4/6 rounded bg-[var(--dash-border)]" />
                 </div>
                 <div className="mt-4 flex gap-2">
                   <span className="h-5 px-2 rounded flex items-center text-[9px] font-mono font-bold uppercase tracking-widest" style={{ background: `${LAYERS[1].accent}22`, color: LAYERS[1].accent }}>Summary</span>
                   <span className="h-5 px-2 rounded flex items-center text-[9px] font-mono font-bold uppercase tracking-widest" style={{ background: `${LAYERS[1].accent}22`, color: LAYERS[1].accent }}>Extracted</span>
                 </div>
                 {/* Scanning line effect */}
                 <div className="absolute top-0 left-0 right-0 h-[2px] opacity-50 shadow-[0_0_10px_currentColor] animate-[scan_2s_linear_infinite]" style={{ background: LAYERS[1].accent, color: LAYERS[1].accent }} />
               </div>
             </div>
           )}

           {activeLayer === 2 && (
             <div className="animate-[fade-in_0.4s_ease-out] relative h-40 w-40 flex items-center justify-center">
               <div className="absolute w-14 h-14 rounded-full border flex items-center justify-center z-10 shadow-lg animate-[pulse_2s_infinite]" style={{ borderColor: LAYERS[2].accent, background: `${LAYERS[2].accent}22` }}>
                 <Network className="h-6 w-6" style={{ color: LAYERS[2].accent }} />
               </div>
               
               {/* Orbital nodes */}
               {[0, 1, 2].map(i => (
                 <div key={i} className="absolute inset-0 animate-[spin_8s_linear_infinite]" style={{ animationDelay: `${i * -2.6}s` }}>
                   <div className="absolute top-0 left-1/2 -ml-3.5 w-7 h-7 rounded-full bg-[var(--dash-bg)] border border-[var(--dash-border)] flex items-center justify-center shadow-md">
                     <span className="h-2 w-2 rounded-full" style={{ background: LAYERS[2].accent }} />
                   </div>
                 </div>
               ))}
               <p className="absolute -bottom-8 text-xs font-mono font-bold tracking-wider" style={{ color: LAYERS[2].accent }}>KNOWLEDGE GRAPH</p>
             </div>
           )}

           {activeLayer === 3 && (
             <div className="animate-[fade-in_0.4s_ease-out] flex flex-col items-center gap-5">
                <div className="relative flex items-center gap-4">
                  <div className="h-12 w-12 rounded-xl bg-[var(--dash-bg)] border border-[var(--dash-border)] flex items-center justify-center shadow-md">
                    <FileText className="h-5 w-5 text-[var(--dash-muted)]" />
                  </div>
                  <div className="h-px w-14 relative" style={{ background: 'var(--dash-border)' }}>
                    <div className="absolute inset-0 animate-[pulse_1s_infinite]" style={{ background: LAYERS[3].accent }} />
                  </div>
                  <div className="h-14 w-14 rounded-full flex items-center justify-center shadow-lg" style={{ background: `${LAYERS[3].accent}11`, border: `1px solid ${LAYERS[3].accent}` }}>
                    <Brain className="h-7 w-7 animate-pulse" style={{ color: LAYERS[3].accent }} />
                  </div>
                  <div className="h-px w-14 relative" style={{ background: 'var(--dash-border)' }}>
                    <div className="absolute inset-0 animate-[pulse_1s_infinite_0.5s]" style={{ background: LAYERS[3].accent }} />
                  </div>
                  <div className="h-12 w-12 rounded-xl bg-[var(--dash-bg)] border border-[var(--dash-border)] flex items-center justify-center shadow-md">
                    <Zap className="h-5 w-5 text-[var(--dash-muted)]" />
                  </div>
                </div>
                <p className="text-xs font-mono font-bold tracking-wider" style={{ color: LAYERS[3].accent }}>CROSS-SOURCE SYNTHESIS</p>
             </div>
           )}

           {activeLayer === 4 && (
             <div className="animate-[fade-in_0.4s_ease-out] w-full max-w-[280px] flex flex-col gap-2.5 font-mono text-[10px]">
               {[
                 { action: 'INGEST', file: 'Q4_report.pdf', status: 'SUCCESS' },
                 { action: 'LINK', file: 'Entity: Acme Co', status: 'MAPPED' },
                 { action: 'QUERY', file: 'Squad Agent: Sage', status: 'EXECUTED' },
               ].map((log, i) => (
                 <div key={i} className="flex items-center justify-between p-2.5 rounded-lg border border-[var(--dash-border)] bg-[var(--dash-bg)] opacity-0 animate-[slide-in-right_0.4s_ease-out_forwards]" style={{ animationDelay: `${i * 0.15}s` }}>
                   <div className="flex gap-2 items-center">
                     <span className="font-bold tracking-wider" style={{ color: LAYERS[4].accent }}>{log.action}</span>
                     <span className="text-[var(--dash-muted)]">{log.file}</span>
                   </div>
                   <Activity className="h-3.5 w-3.5" style={{ color: LAYERS[4].accent }} />
                 </div>
               ))}
                <p className="text-center mt-3 text-xs font-mono font-bold tracking-wider" style={{ color: LAYERS[4].accent }}>IMMUTABLE AUDIT TRAIL</p>
             </div>
           )}
         </div>
      </div>
      <style jsx>{`
        @keyframes float {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-8px); }
        }
        @keyframes scan {
          0% { top: 0; }
          50% { top: 100%; }
          100% { top: 0; }
        }
        @keyframes slide-in-right {
          from { opacity: 0; transform: translateX(10px); }
          to { opacity: 1; transform: translateX(0); }
        }
      `}</style>
    </div>
  )
}
