import { Sidebar } from '@/components/sidebar'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="flex h-dvh overflow-hidden text-[var(--text-primary)]"
      style={{ background: 'var(--bg)' }}
    >
      <Sidebar />
      <main className="flex-1 overflow-y-auto pt-[74px] pb-[86px] md:pt-0 md:pb-0">
        {children}
      </main>
    </div>
  )
}
