// ── Runner factory ────────────────────────────────────────────────────────────
// Selects the AgentRunner driver, mirroring the `getProvisioner()` pattern in
// `agent-provisioner.ts`. Both drivers satisfy the same `AgentRunner` contract,
// are handed the same read-only `VaultTools`, and always emit `DraftProposal[]`
// (propose-never-write). See design.md → "1. The runner engine".
import type { AgentRunner } from './types'
import { ClaudeVaultRunner } from './claude-vault-runner'
import { HermesContainerRunner } from './hermes-container-runner'

export { ClaudeVaultRunner } from './claude-vault-runner'
export { HermesContainerRunner } from './hermes-container-runner'
export type { AgentRunner } from './types'

/**
 * Returns the active runner driver, selected by `process.env.AGENT_RUNNER`:
 *   • 'claude' (default) → ClaudeVaultRunner (execution model B, in-process — NOW).
 *   • 'hermes'           → HermesContainerRunner (execution model A, container).
 *
 * Both drivers satisfy the identical `AgentRunner` / `Proposal` interface and are
 * handed the same read-only `VaultTools`, so the downstream Aegis path is the same
 * regardless of which one runs (Req 2.11). The default (no `AGENT_RUNNER` set)
 * stays `ClaudeVaultRunner` — existing runs are unaffected.
 */
export function getRunner(): AgentRunner {
  const driver = process.env.AGENT_RUNNER || 'claude'
  if (driver === 'hermes') {
    return new HermesContainerRunner()
  }
  return new ClaudeVaultRunner()
}
