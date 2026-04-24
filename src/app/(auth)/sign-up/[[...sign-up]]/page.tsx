import Link from 'next/link'
import { SignUp } from '@clerk/nextjs'
import { BrainMark } from '@/components/ui/BrainMark'
import { clerkAppearance } from '../../clerk-appearance'

export default function SignUpPage() {
  return (
    <div className="relative min-h-screen bg-[var(--bg)] text-[var(--text-primary)] overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          background:
            'radial-gradient(ellipse 60% 55% at 50% 35%, color-mix(in srgb, var(--accent) 9%, transparent), transparent 65%)',
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 grid-bg opacity-30"
        style={{
          maskImage:
            'radial-gradient(ellipse 70% 70% at 50% 50%, #000 30%, transparent 85%)',
          WebkitMaskImage:
            'radial-gradient(ellipse 70% 70% at 50% 50%, #000 30%, transparent 85%)',
        }}
      />

      <Link
        href="/"
        className="absolute top-6 left-6 flex items-center gap-3 group"
      >
        <span
          className="relative grid h-9 w-9 place-items-center overflow-hidden rounded-full border border-[var(--border-bright)] transition-all duration-300 group-hover:border-[var(--border-glow)]"
          style={{ background: 'var(--metallic)' }}
        >
          <span
            aria-hidden
            className="absolute inset-0 pointer-events-none rounded-full"
            style={{ background: 'var(--metallic-hi)' }}
          />
          <BrainMark size={24} className="relative z-[1] text-[#e5e5ea]" />
        </span>
        <span className="text-sm font-semibold tracking-tight text-[var(--text-primary)]">
          SecondBrain
          <span className="text-[var(--text-muted)] font-normal ml-1">Cloud</span>
        </span>
      </Link>

      <main className="min-h-screen grid place-items-center px-6 py-24">
        <SignUp
          appearance={clerkAppearance}
          signInUrl="/sign-in"
          forceRedirectUrl="/app/dashboard"
        />
      </main>
    </div>
  )
}
