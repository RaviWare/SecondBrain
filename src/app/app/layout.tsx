import { Sidebar } from '@/components/sidebar'
import { CommandPalette } from '@/components/dashboard/CommandPalette'
import { ToastViewport } from '@/components/ui/ToastViewport'
import { ShortcutsDialog } from '@/components/ui/ShortcutsDialog'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="flex h-dvh overflow-hidden text-[var(--text-primary)]"
      style={{ background: 'var(--app-bg)' }}
    >
      {/* Global ⌘K / Ctrl+K command palette — available on every in-app page. */}
      <CommandPalette />
      {/* Global toast notifications — any code can call toast(...) from anywhere. */}
      <ToastViewport />
      {/* "?" keyboard-shortcuts cheatsheet. */}
      <ShortcutsDialog />
      <Sidebar />
      <main className="flex-1 overflow-y-auto pt-[74px] pb-[86px] md:pt-0 md:pb-0">
        {children}
      </main>
    </div>
  )
}
