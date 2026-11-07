import type { Status } from './status';

/** Diagram walkthrough. Each step highlights the diagram nodes in `nodes`. */
export interface ArchStep {
  n: number;
  title: string;
  body: string;
  nodes: string[];
}

export const archSteps: ArchStep[] = [
  {
    n: 1,
    title: 'Any actor proposes',
    body: 'A human, a UI acting for that human, an AI model, an agent or a planner submits a proposed state transition using one fixed proposal schema. None of them can perform the transition.',
    nodes: ['proposers'],
  },
  {
    n: 2,
    title: 'The proposal crosses the boundary',
    body: 'Proposals travel on a dedicated lane into Invari.kOS. A PENDING receipt is written before evaluation begins — an intermediate receipt state, not a third outcome.',
    nodes: ['lane', 'kernel'],
  },
  {
    n: 3,
    title: 'The kernel evaluates recorded inputs',
    body: 'Under K=STRICT each input — state S, proposed change ΔS, actor and authority A, policy P, capability C, evidence E, time T, and the K and N constants — starts failed and must be affirmatively established. Policy arrives as a versioned external bundle; the kernel resolves it, it does not interpret law.',
    nodes: ['kernel', 'inputs'],
  },
  {
    n: 4,
    title: 'Exactly two terminal outcomes',
    body: 'The proposal is COMMITTED or REJECTED. A proposal formed against a stale entity version is rejected deterministically; the proposer resubmits against the current version.',
    nodes: ['commit', 'reject'],
  },
  {
    n: 5,
    title: 'Both outcomes are recorded',
    body: 'Invari.CORE holds dual ledgers (DAPA): an accepted-transition store and a rejected-transition store, each hash-chained so a refusal is as much a recorded fact as a commit.',
    nodes: ['accepted', 'rejected'],
  },
  {
    n: 6,
    title: 'Governed state flows downstream',
    body: 'On commit, the entity’s State Compression Matrix is created or updated, and the Shared ISA encodes it for every consumer. The UI renders it, an AI receives it before inference, and the next proposal starts from it.',
    nodes: ['matrix', 'isa', 'consumers'],
  },
];

/** Node status badges in the diagram. */
export const nodeStatus: Record<string, { status: Status; note: string }> = {
  kernel: { status: 'tested', note: 'Commit path, receipts and version check tested' },
  accepted: { status: 'external', note: 'Signed chain verified by a third party' },
  rejected: { status: 'partial', note: 'Refusal records sealed and signed; receipt outcome not yet signed' },
  matrix: { status: 'implemented', note: 'Matrix pipeline built; some fields placeholder' },
  isa: { status: 'specified', note: 'Specified wire format not yet built' },
};

export interface Concept {
  title: string;
  body: string;
  status: Status;
  evidence?: string;
}

export const concepts: Concept[] = [
  {
    title: 'A single authorized path',
    body: 'Invari.kOS is the only component permitted to mutate canonical state. The intended enforcement is narrower than topology: every non-kernel service is provisioned with a read-only database role.',
    status: 'partial',
    evidence: 'ev-01',
  },
  {
    title: 'Proposal is separate from authority',
    body: 'Proposal generation can be exploratory, uncertain, even wrong. Everything upstream of the kernel is allowed to be; nothing downstream of it is. The kernel is where uncertainty ends and canonical state begins.',
    status: 'tested',
    evidence: 'ev-09',
  },
  {
    title: 'Deterministic evaluation',
    body: 'evaluate(S, ΔS, A, P, C, E, T, K, N) → ACCEPTED | REJECTED, with no wall-clock reads, network calls or randomness, so any past decision can be replayed. Since 5 November 2026 policies read only a sealed, in-transaction view of the ledger and never the clock; a replay tool is not yet built.',
    status: 'partial',
    evidence: 'ev-08',
  },
  {
    title: 'Commit-time validity',
    body: 'A proposal is conditioned on the entity version it was formed against still being current. Two proposals racing for one entity: exactly one version check can still be true after the first commit.',
    status: 'tested',
    evidence: 'ev-02',
  },
  {
    title: 'Append-only, hash-chained history',
    body: 'Each record incorporates the hash of its predecessor and is signed. That makes modification detectable — relative to a chain head or checkpoint that is itself independently trusted. Hash chaining alone does not prove authenticity.',
    status: 'external',
    evidence: 'ev-05',
  },
  {
    title: 'Capability-based authorization',
    body: 'An actor is shown only the transitions it may perform: the set valid for the entity’s current state and policy, intersected with what the actor is eligible for — computed with the commit, not re-derived per click.',
    status: 'partial',
    evidence: 'ev-03',
  },
  {
    title: 'Policy interpretation stays outside',
    body: 'Legal and business judgment lives in versioned policy bundles authored and audited outside the kernel. The kernel’s job is mechanical: resolve the bundle’s output against current canonical state.',
    status: 'open',
    evidence: 'ev-14',
  },
  {
    title: 'An outside write is not canonical',
    body: 'A row written outside the kernel may physically land in a table. It does not extend the hash chain, carries no receipt, and never produces a matrix update or opcode — so no governed consumer recognises it. Canonical history is defined as the sequence the kernel produced.',
    status: 'external',
    evidence: 'ev-05',
  },
];
