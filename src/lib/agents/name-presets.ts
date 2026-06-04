// ── Agent / Squad name presets ────────────────────────────────────────────────
// Pre-loaded, characterful names so users who don't want to invent a name can
// pick a great one in a click. Names are relatable to what the agent DOES (a
// security-audit agent can be "Sentinel" / "Warden"; a researcher "Sherlock").
//
// PURE DATA + small pure helpers. No I/O. The UI (builder) reads these to render
// a "Suggest a name" picker; nothing here is persisted differently from a
// hand-typed name — it's just a friendlier way to fill the same field.

import type { AgentRole } from './builder'

/** A single suggested name with a short why-it-fits blurb. */
export interface NamePreset {
  name: string
  /** one-line flavor shown under the name */
  blurb: string
}

/**
 * Role-themed agent names. Each list is curated to the role's job so the name
 * feels earned (a Critic named "Cipher", a Scout named "Ranger", etc.). These map
 * to the same `AgentRole` union the builder uses.
 */
export const AGENT_NAME_PRESETS: Record<AgentRole, NamePreset[]> = {
  scout: [
    { name: 'Ranger', blurb: 'Roams your sources for anything new worth grabbing.' },
    { name: 'Scout', blurb: 'First eyes on every fresh signal.' },
    { name: 'Falcon', blurb: 'Spots changes from a mile up.' },
    { name: 'Magellan', blurb: 'Charts new territory in your sources.' },
    { name: 'Radar', blurb: 'Nothing new slips past the sweep.' },
    { name: 'Patrol', blurb: 'Walks the beat across your feeds.' },
  ],
  synthesist: [
    { name: 'Sage', blurb: 'Distills many notes into one clear truth.' },
    { name: 'Athena', blurb: 'Wisdom from everything you know.' },
    { name: 'Mosaic', blurb: 'Assembles scattered pieces into a picture.' },
    { name: 'Compass', blurb: 'Points to what it all adds up to.' },
    { name: 'Oracle', blurb: 'Synthesizes the signal from the noise.' },
    { name: 'Quill', blurb: 'Writes your understanding down, cleanly.' },
  ],
  connector: [
    { name: 'Bridge', blurb: 'Links the notes that belong together.' },
    { name: 'Nexus', blurb: 'The hub where your ideas meet.' },
    { name: 'Weaver', blurb: 'Threads connections through your vault.' },
    { name: 'Link', blurb: 'Finds the line between A and B.' },
    { name: 'Hermes', blurb: 'Carries meaning between your notes.' },
    { name: 'Synapse', blurb: 'Fires the connection you missed.' },
  ],
  critic: [
    { name: 'Sentinel', blurb: 'Stands guard over your facts.' },
    { name: 'Warden', blurb: 'Flags risks before they cost you.' },
    { name: 'Cipher', blurb: 'Decodes contradictions in the record.' },
    { name: 'Inspector', blurb: 'Audits every claim for cracks.' },
    { name: 'Sherlock', blurb: 'Spots what does not add up.' },
    { name: 'Argus', blurb: 'A hundred eyes on what could go wrong.' },
  ],
  librarian: [
    { name: 'Dewey', blurb: 'Files everything where it belongs.' },
    { name: 'Curator', blurb: 'Keeps the collection tidy and findable.' },
    { name: 'Archive', blurb: 'Nothing gets lost on its watch.' },
    { name: 'Keeper', blurb: 'Triages the pile so you do not have to.' },
    { name: 'Index', blurb: 'Makes everything instantly retrievable.' },
    { name: 'Atlas', blurb: 'Holds the whole map of what you know.' },
  ],
  researcher: [
    { name: 'Sherlock', blurb: 'Digs deep and shows its work.' },
    { name: 'Darwin', blurb: 'Investigates patterns across the evidence.' },
    { name: 'Fury', blurb: 'Relentless on the hard questions.' },
    { name: 'Marie', blurb: 'Rigorous research, cited end to end.' },
    { name: 'Probe', blurb: 'Goes past the first answer to the real one.' },
    { name: 'Tesla', blurb: 'Connects research into something new.' },
  ],
  custom: [
    { name: 'Jarvis', blurb: 'Your reliable all-rounder.' },
    { name: 'Friday', blurb: 'Gets whatever needs doing, done.' },
    { name: 'Vision', blurb: 'Sees the goal and works toward it.' },
    { name: 'Pixel', blurb: 'Sharp, precise, dependable.' },
    { name: 'Nova', blurb: 'Bright new addition to the squad.' },
    { name: 'Echo', blurb: 'Carries your intent through to the end.' },
  ],
}

/** A flat pool of strong general names (used when no role is chosen yet). */
export const GENERAL_AGENT_NAMES: NamePreset[] = [
  { name: 'Jarvis', blurb: 'Dependable all-rounder.' },
  { name: 'Athena', blurb: 'Strategy and wisdom.' },
  { name: 'Sentinel', blurb: 'Always on guard.' },
  { name: 'Sherlock', blurb: 'Finds what others miss.' },
  { name: 'Atlas', blurb: 'Carries the whole picture.' },
  { name: 'Nova', blurb: 'A bright new hire.' },
  { name: 'Sage', blurb: 'Calm, clear thinking.' },
  { name: 'Falcon', blurb: 'Fast and far-seeing.' },
]

/** Squad (team) name presets — for naming a whole group of agents. */
export const SQUAD_NAME_PRESETS: NamePreset[] = [
  { name: 'Mission Control', blurb: 'The room where it all comes together.' },
  { name: 'The Brain Trust', blurb: 'Your smartest people, on demand.' },
  { name: 'Avengers', blurb: 'A specialist for every threat.' },
  { name: 'The Watchtower', blurb: 'Eyes on everything, always.' },
  { name: 'Task Force', blurb: 'Pointed at one goal, moving fast.' },
  { name: 'The Bureau', blurb: 'Methodical, thorough, on the case.' },
  { name: 'Dream Team', blurb: 'The lineup you wish you could hire.' },
  { name: 'The Lab', blurb: 'Where your ideas get built.' },
]

/**
 * Themed squad packs — a named lead + complementary specialist names, so a user
 * can adopt a whole coherent team in one go (like the Mission Control examples).
 */
export interface SquadPack {
  id: string
  squadName: string
  theme: string
  members: Array<{ name: string; role: AgentRole; hat: string }>
}

export const SQUAD_PACKS: SquadPack[] = [
  {
    id: 'knowledge-ops',
    squadName: 'The Brain Trust',
    theme: 'A balanced team to grow and guard your knowledge.',
    members: [
      { name: 'Ranger', role: 'scout', hat: 'Source scout' },
      { name: 'Sage', role: 'synthesist', hat: 'Synthesist' },
      { name: 'Bridge', role: 'connector', hat: 'Connector' },
      { name: 'Sentinel', role: 'critic', hat: 'Critic' },
      { name: 'Dewey', role: 'librarian', hat: 'Librarian' },
    ],
  },
  {
    id: 'research-desk',
    squadName: 'The Research Desk',
    theme: 'Deep investigation with a hard truth-check.',
    members: [
      { name: 'Sherlock', role: 'researcher', hat: 'Lead researcher' },
      { name: 'Fury', role: 'scout', hat: 'Source hunter' },
      { name: 'Athena', role: 'synthesist', hat: 'Synthesist' },
      { name: 'Cipher', role: 'critic', hat: 'Fact-checker' },
    ],
  },
  {
    id: 'watchtower',
    squadName: 'The Watchtower',
    theme: 'Keep your vault clean, current, and contradiction-free.',
    members: [
      { name: 'Warden', role: 'critic', hat: 'Risk watch' },
      { name: 'Curator', role: 'librarian', hat: 'Keeper' },
      { name: 'Radar', role: 'scout', hat: 'Change spotter' },
    ],
  },
]

/** Names already taken by the user's existing agents, lowercased for dedupe. */
export type TakenNames = ReadonlySet<string>

/**
 * Suggest names for a role (or general when role is undefined), excluding any the
 * user already used. PURE. Returns up to `limit` presets, in catalog order.
 */
export function suggestNames(
  role: AgentRole | undefined,
  taken: TakenNames = new Set(),
  limit = 6,
): NamePreset[] {
  const pool = role ? AGENT_NAME_PRESETS[role] ?? GENERAL_AGENT_NAMES : GENERAL_AGENT_NAMES
  const out: NamePreset[] = []
  for (const p of pool) {
    if (taken.has(p.name.trim().toLowerCase())) continue
    out.push(p)
    if (out.length >= limit) break
  }
  // If filtering left us short, top up from the general pool (still deduped).
  if (out.length < limit) {
    for (const p of GENERAL_AGENT_NAMES) {
      if (taken.has(p.name.trim().toLowerCase())) continue
      if (out.some((o) => o.name === p.name)) continue
      out.push(p)
      if (out.length >= limit) break
    }
  }
  return out
}
