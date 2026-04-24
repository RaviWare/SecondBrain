/**
 * BrainMark — top-view brain, scalloped-gyri style
 * ------------------------------------------------
 * Replicates the reference: the outer silhouette is built from 5 convex
 * bezier segments per side so each hemisphere reads as a series of
 * gyrus bumps (not a smooth egg). Four inner C-shaped folds curl
 * toward the longitudinal fissure, matching the classic top-view brain
 * iconography used across anatomy libraries.
 *
 * Monochrome single-ink — inherits one colour via `currentColor`.
 */
import type { SVGProps } from 'react'

export function BrainMark({
  size = 22,
  ...rest
}: { size?: number } & SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 64 64"
      width={size}
      height={size}
      fill="none"
      aria-hidden
      {...rest}
    >
      <g
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      >
        {/* ── Outer silhouette — scalloped with 5 convex segments per side ── */}
        {/* Left hemisphere */}
        <path d="M32 9
                 C27 6 21 7 19 11
                 C15 11 11 15 12 20
                 C7 22 6 28 10 31
                 C7 35 8 43 13 46
                 C14 51 20 55 32 54" />
        {/* Right hemisphere — mirror */}
        <path d="M32 9
                 C37 6 43 7 45 11
                 C49 11 53 15 52 20
                 C57 22 58 28 54 31
                 C57 35 56 43 51 46
                 C50 51 44 55 32 54" />

        {/* ── Longitudinal fissure — prominent, gently meandering ── */}
        <path d="M32 10 C30 18 34 26 32 32 C30 38 34 46 32 54" strokeWidth="2.2" />

        {/* ── Left hemisphere gyri (4 C-folds) ── */}
        <path d="M24 15 C27 17 27 21 24 21" />
        <path d="M16 24 C20 25 22 28 20 31" />
        <path d="M18 36 C22 37 24 40 21 43" />
        <path d="M23 46 C26 47 28 50 25 52" />

        {/* ── Right hemisphere gyri (mirrored) ── */}
        <path d="M40 15 C37 17 37 21 40 21" />
        <path d="M48 24 C44 25 42 28 44 31" />
        <path d="M46 36 C42 37 40 40 43 43" />
        <path d="M41 46 C38 47 36 50 39 52" />
      </g>

      {/* ── Synapse dots — subtle "neural nodes" at gyrus tips ── */}
      <g fill="currentColor">
        {/* Left hemisphere nodes */}
        <circle cx="24" cy="15" r="0.9" />
        <circle cx="16" cy="24" r="0.9" />
        <circle cx="23" cy="46" r="0.9" />
        {/* Right hemisphere nodes (mirror) */}
        <circle cx="40" cy="15" r="0.9" />
        <circle cx="48" cy="24" r="0.9" />
        <circle cx="41" cy="46" r="0.9" />
        {/* Central cleft node on the fissure */}
        <circle cx="32" cy="32" r="1.3" />
      </g>
    </svg>
  )
}
