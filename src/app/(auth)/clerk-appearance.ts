/**
 * Branded Clerk appearance — Apple Silicon + orange accent.
 * Shared between /sign-in and /sign-up.
 */
export const clerkAppearance = {
  variables: {
    colorPrimary: '#ff7a1f',
    colorBackground: '#141416',
    colorInputBackground: '#1a1a1d',
    colorInputText: '#f5f5f7',
    colorText: '#f5f5f7',
    colorTextSecondary: '#a1a1a6',
    colorNeutral: '#e5e5ea',
    borderRadius: '10px',
    fontFamily: 'var(--font-inter), ui-sans-serif, system-ui',
  },
  elements: {
    rootBox: 'w-full max-w-[440px]',
    card:
      'bg-[var(--surface)] border border-[var(--border-bright)] shadow-[var(--shadow-2)] rounded-2xl',
    headerTitle: 'text-[var(--text-primary)] tracking-tight',
    headerSubtitle: 'text-[var(--text-secondary)]',
    socialButtonsBlockButton:
      'bg-[var(--surface-2)] border border-[var(--border-bright)] hover:border-[var(--border-glow)] text-[var(--text-primary)]',
    formButtonPrimary:
      'bg-gradient-to-br from-[#ff9146] to-[#ff7a1f] hover:opacity-95 text-black font-semibold',
    formFieldLabel: 'text-[var(--text-secondary)]',
    formFieldInput:
      'bg-[var(--surface-2)] border border-[var(--border-bright)] text-[var(--text-primary)]',
    footerActionLink: 'text-[var(--accent-bright)] hover:text-[var(--accent)]',
    dividerLine: 'bg-[var(--border)]',
    dividerText: 'text-[var(--text-muted)]',
    identityPreviewEditButton: 'text-[var(--accent-bright)]',
    // Hide "Secured by Clerk" branding across all Clerk surfaces
    logoBox: 'hidden',
    poweredByClerk: 'hidden',
    userButtonPopoverFooter: 'hidden',
  },
}
