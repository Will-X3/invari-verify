import type { Status } from './status';

/**
 * Evidence records shown in the Verification Lab.
 *
 * Source: the Invari.kOS architecture and engineering workbook (Whitepaper
 * Claims, Architecture Principles, Bug / TODO / Remediation registers,
 * Adversarial Tests, QUORUM and RTE readiness sheets), reconciled 21 Oct 2026;
 * ev-16 to ev-19, ev-05 / ev-06 and the remediation snapshot updated 29 Oct 2026;
 * ev-05, ev-08, ev-13, ev-14, ev-16 and the snapshot updated 6 Nov 2026.
 * Every statement below is a restatement of a recorded entry. Nothing here is
 * a live measurement. "refs" are the workbook's own finding IDs so an
 * internal reviewer can trace each record back to its row.
 *
 * Edit this file to update evidence. Keep claims, evidence and limits
 * separate — that separation is the point of the section.
 */
export interface EvidenceRecord {
  id: string;
  title: string;
  status: Status;
  laws: number[];
  claim: string;
  evidence: string[];
  limits: string[];
  method: string;
  refs: string[];
}

export const evidence: EvidenceRecord[] = [
  {
    id: 'ev-01',
    title: 'Single governed commit path',
    status: 'partial',
    laws: [1, 3],
    claim:
      'Invari.kOS is the only path to canonical state. Non-kernel services hold no credential that can open a write against canonical collections.',
    evidence: [
      'Every known ledger writer in the reviewed codebase routes through one kernel commit function.',
      'Direct save, insert, update, replace and delete operations on the ledger model throw instead of writing.',
      'System-originated writes happen only in-process, as declared records of a live human act or declared derivations of a committed entry.',
    ],
    limits: [
      'The guarantee currently holds at the application layer. Database-role scoping — read-only credentials for every non-kernel service — has not yet been configured or confirmed and is tracked as a pre-pilot gate.',
    ],
    method: 'Code review and remediation; workbook “Whitepaper Claims” 1–2.',
    refs: ['Claim 1', 'Claim 2', 'T-01', 'P-03'],
  },
  {
    id: 'ev-02',
    title: 'Stale-version proposals are rejected',
    status: 'tested',
    laws: [2],
    claim:
      'A proposal is committed only if the entity version it was formed against is still current at commit time. A stale proposal is rejected, not merged or retried.',
    evidence: [
      'Proposals carry an expected version; the commit re-checks the chain head inside the transaction.',
      'A unique index on (entity, version) backs the check at the database level.',
      'Integration test: eight concurrent proposals against one entity — exactly one commits; the rest are rejected as STALE_VERSION.',
    ],
    limits: [
      'Exercised in a development replica set by an integration test. This is a correctness test, not a load or performance benchmark.',
    ],
    method: 'Committed integration test.',
    refs: ['Claim 6', 'B-05', 'B-07'],
  },
  {
    id: 'ev-03',
    title: 'Authority is resolved live, not carried in the token',
    status: 'tested',
    laws: [2, 3],
    claim:
      'A token establishes identity only. Tenancy, role and capability are resolved at the moment of each act, so revocation takes effect immediately rather than at token expiry.',
    evidence: [
      'Both HTTP requests and every message on the governed socket re-resolve identity and authority before acting.',
      'Recorded adversarial runs: tokens forged with the server’s own signing secret to claim a senior role, platform status or a System identity were refused — the database, not the token, decided.',
      'A demotion made the previous token stale at the next request; terminating an employee closed their open session.',
      'An inviter cannot grant a role above their own authority ceiling; the server refuses before any ledger write.',
    ],
    limits: [
      'The dashboard still reads display copies of role and capabilities from the token. Authority decisions do not depend on them, but slimming the token to identity only is open work.',
    ],
    method: 'Live adversarial runs with expected outcomes written before sending, plus database checks.',
    refs: ['P-06', 'R-35', 'R-83', 'R-88', 'R-32'],
  },
  {
    id: 'ev-04',
    title: 'Receipted, two-phase commit with fail-closed timeout',
    status: 'tested',
    laws: [4, 5],
    claim:
      'A PENDING receipt exists before evaluation begins. A receipt that never resolves before its deadline is rejected — never assumed valid, silently retried or resumed.',
    evidence: [
      'The PENDING receipt is durable before evaluation; the ledger entry, its ACCEPTED receipt and the outbox record commit atomically.',
      'A K(t) sweeper finalizes expired PENDING receipts as REJECTED, and the commit path refuses any receipt past its deadline.',
      'Integration tests cover both: an expired receipt is swept to REJECTED and cannot commit.',
    ],
    limits: [
      'For flows that own their own transaction, the receipt is written inside that transaction and so is not durable before evaluation. On abort it is re-inserted and recorded REJECTED.',
    ],
    method: 'Committed integration tests.',
    refs: ['Claim 5', 'B-33', 'B-34', 'T-05'],
  },
  {
    id: 'ev-05',
    title: 'Signed hash chain, verifiable by a third party',
    status: 'external',
    laws: [5, 6],
    claim:
      'Committed history is append-only and tamper-evident. A record produced outside the kernel does not verify against the chain it claims to belong to.',
    evidence: [
      'Each ledger entry is canonicalized, hashed with its predecessor and sealed with an Ed25519 signature.',
      'A platform chain export was verified by a third party using only the published Ed25519 public key: every hash recomputed, every signature verified and the master root matched.',
      'The verifier needs no database, network access or Invari packages.',
      'Since 5 November 2026 each entry also seals the context it was evaluated against — the context bundle hash and the instant it was pinned — inside the signed hash. Harness case V1 verifies an export mixing both formats; T4, with one context anchor changed, fails on that entry.',
    ],
    limits: [
      'Hash chaining detects alteration, insertion, deletion or reordering relative to a chain head that is independently trusted. Chain heads for the published cases are recorded in the harness’s git-timestamped CHECKPOINTS.md, but they were published after the events; anchoring heads outside Invari at commit time is not yet built.',
      'Whoever holds the private signing key can sign. The key remains the one trusted secret; its storage and rotation procedure is a pre-pilot gate.',
    ],
    method: 'Independent verification of an exported chain with the public key only.',
    refs: ['Claim 8', 'Claim 13', 'T-03', 'T-31', 'T-44'],
  },
  {
    id: 'ev-06',
    title: 'A refusal can be checked outside Invari',
    status: 'partial',
    laws: [4, 5],
    claim:
      'A rejected proposal is as much a fact as a committed one, and can be checked independently.',
    evidence: [
      'A standalone verifier checks a refused proposal from an exported evidence folder: the chain verifies, the receipt’s input commitment recomputes and its signature verifies, the proposal targeted the recorded state version, and no entry was written from it.',
      'Run against a recorded live refusal: PASS.',
      'Since 17 October 2026, every refusal record is sealed whole — what was attempted, the reason, the actor — and signed with the same key as the ledger. Changing any field breaks the seal; the record references, rather than copies, the prior ledger entry.',
      'A workflow refusal — refused before anything reached the kernel — is published in the harness with its signed record (case R1), and a copy with one word of the message changed fails (T2).',
    ],
    limits: [
      'The rejection receipt — the record the published verifier checks — signs its inputs but not yet its final outcome and reason code, so the verifier reports the receipt’s outcome as UNSIGNED. The separate refusal record is signed; signing the receipt outcome is open.',
      'The endpoint for verifying a refusal chain is implemented but not yet routed.',
    ],
    method: 'Standalone verifier run on live refusals; open harness cases R1 and T2; check scripts.',
    refs: ['Claim 12', 'R-95', 'R-76', 'R-123', 'T-31'],
  },
  {
    id: 'ev-07',
    title: 'K=STRICT: inputs fail closed by default',
    status: 'partial',
    laws: [4],
    claim:
      'Every required input — time, evidence, identity, policy, capability — begins failed and becomes valid only when affirmatively established.',
    evidence: [
      'Named refusal codes for ambiguous tenancy, missing standing, undeclared derivations and non-human proposers of regulated acts, each covered by a check script.',
      'The kernel refuses to boot without its signing key, required unique indexes, a replica set and valid domain contracts.',
      'A former silent drop of unregistered capabilities was replaced by classify-or-refuse; a policy with no declared scope is now refused rather than applied everywhere.',
    ],
    limits: [
      'In the governed transport layer, frame delivery deliberately fails open when tenant context or receipt creation is missing. This is an explicit design decision awaiting review, and it contradicts the K=STRICT claim until resolved.',
    ],
    method: 'Check scripts, boot assertions and code review.',
    refs: ['Claim 7', 'P-02', 'B-28', 'B-62'],
  },
  {
    id: 'ev-08',
    title: 'Deterministic evaluation of recorded inputs',
    status: 'partial',
    laws: [2, 5],
    claim:
      'evaluate(S, ΔS, A, P, C, E, T, K, N) is a pure function of explicitly recorded inputs, so any past decision can be re-executed and reproduced.',
    evidence: [
      'The evaluation timestamp is pinned and the chain head is read from the transaction snapshot.',
      'Clock reads previously sealed into entries have been removed.',
      'Policies no longer write during evaluation: the state change one policy used to make mid-evaluation is now applied inside the commit transaction, verified in a live run.',
      'Since 5 November 2026 no policy receives a database handle or reads the clock. Each reads the ledger only through a read-only view the kernel builds inside the transaction that commits the entry, limited to the chains it declares; what it read is sealed in the entry’s trace.',
      'Policy bundles are kept append-only by version, so the bundle that governed a past entry stays available to evaluate it against.',
    ],
    limits: [
      'Entries written before 5 November 2026 were evaluated by policies that could still read the database directly; they cannot be replayed from the record alone.',
      'A replay tool that re-runs a past decision from its sealed inputs is not yet built or published.',
    ],
    method: 'Check scripts (68 purity checks) and recorded live runs.',
    refs: ['Claim 3', 'R-109', 'T-66', 'T-78', 'T-79', 'R-181'],
  },
  {
    id: 'ev-09',
    title: 'The system holds no authority of its own',
    status: 'tested',
    laws: [1, 3, 7],
    claim:
      'A system-written event carries the authority of what caused it. A regulated act is proposed only from the human’s own session, under their own identity.',
    evidence: [
      'Every system derivation is declared in a table; an undeclared one is refused.',
      'No System credential exists over HTTP or the socket. System entries carry a sealed reference to the committed entry or live human act that caused them.',
      'Chain verification checks every System entry’s authority after the fact; recorded live transfers verify.',
    ],
    limits: [
      'Demonstrated in the first governed domain only. A general mechanism that scales required authority with consequence or irreversibility is not yet documented.',
      'For the consumer-sale path, the human-proposer rule is covered by check scripts but has not yet been run live; that path is outside the current pilot.',
    ],
    method: 'Live runs, chain verification and check scripts.',
    refs: ['P-04', 'P-05', 'R-82', 'R-84'],
  },
  {
    id: 'ev-10',
    title: 'One evaluation path for every actor',
    status: 'partial',
    laws: [1, 10],
    claim:
      'There is exactly one evaluate() entry point. Actor class is a field in the input, not a fork in control flow.',
    evidence: [
      'Both kernel write paths now apply one shared event-policy check; a path that previously skipped required fields was found and closed.',
    ],
    limits: [
      'Metadata “requires” rules are not yet enforced on either path.',
      'Actor class is a policy input — an event may require a human proposer. The whitepaper’s wording is to be reconciled so this is not read as a privileged branch.',
      'An AI actor class is a design principle; it is not yet built in the kernel.',
    ],
    method: 'Code review and an audit tool run over existing entries.',
    refs: ['Claim 4', 'R-31', 'P-11'],
  },
  {
    id: 'ev-11',
    title: 'Consumers see governed state, not raw rows',
    status: 'open',
    laws: [5],
    claim:
      'UI and AI consumers never receive raw ledger rows — only capability-rendered, governed state.',
    evidence: [
      'Compiled state matrices no longer carry personal names or invitee details.',
      'The live state channel refuses subscriptions to assets the requester has no claim to.',
    ],
    limits: [
      'Several REST read endpoints still return full ledger documents. This contradicts the published claim and is an open finding.',
    ],
    method: 'Code review and live checks.',
    refs: ['Claim 11', 'B-29', 'R-121', 'R-125'],
  },
  {
    id: 'ev-12',
    title: 'Three-lane governed transport',
    status: 'implemented',
    laws: [],
    claim:
      'Proposals, live state delivery and historical queries travel on separate lanes so that none contends with the others.',
    evidence: [
      'One authenticated socket implements distinct ACTION, EXECUTION and QUERY lanes, each with receipt discipline.',
      'Connection-time authentication rejects before the socket opens; query payloads are type-checked at the boundary.',
    ],
    limits: [
      'No formal load or throughput benchmarking has been performed. The throughput argument is architectural, not measured.',
    ],
    method: 'Code review.',
    refs: ['Claim 10'],
  },
  {
    id: 'ev-13',
    title: 'Shared ISA: one canonical encoding',
    status: 'specified',
    laws: [],
    claim:
      'A single compact, self-verifying encoding of governed state is what every consumer — UI and AI alike — decodes, so their pictures of the world cannot diverge.',
    evidence: [
      'A compact state encoding is already produced when an entity’s matrix is rebuilt.',
      'The shared vocabulary every matrix type is written in has a neutral name and a version (5 Nov 2026). Its integrity field now reports all five states and reads INSUFFICIENT when nothing was checked, and a fact sourced from test fixtures can no longer be sealed into a matrix as truth.',
    ],
    limits: [
      'Transport frames currently use a general-purpose format. The specified wire encoding is not built, as the code itself records.',
      'The current encoding does not yet carry every field the specification requires, including its integrity fields.',
    ],
    method: 'Code review; server log observation.',
    refs: ['Claim 16', 'W-02', 'T-74', 'M-02', 'M-05'],
  },
  {
    id: 'ev-14',
    title: 'Policy lives outside the kernel',
    status: 'open',
    laws: [],
    claim:
      'The kernel does not interpret law. Regulatory judgment lives in versioned, externally audited policy bundles.',
    evidence: [
      'Policy bundles are re-verified against their hashes on every load and fail loudly on mismatch.',
      'Since 6 November 2026 bundles are versioned and append-only: a version is never overwritten or deleted, so the law that governed an entry stays on record. Every stored field is covered by a hash computed in one canonical form.',
      'A certification binds to the exact text it was made against, including any section it cites. If that text changes, or the law it cites is amended, the bundle is refused as the bundle in force until the node returns to a human gate — automation ends at once; a person decides again.',
      'Regulatory text is carried character for character: ingestion refuses rather than drops text it cannot place.',
      'A design exists to move licence-type authority into counsel-reviewed domain data evaluated by a pure policy.',
    ],
    limits: [
      'One onboarding policy still hard-codes regulatory reference data in code. Only a small number of event types have a certified bundle today.',
      'The firearms bundles’ text was assembled by hand, not ingested from one retrieved source document, so its fidelity to the source is recorded as unverified. Certifications are interim self-certifications for the shadow pilot, not yet counsel’s.',
    ],
    method: 'Code review.',
    refs: ['Claim 14', 'Claim 15', 'B-46', 'T-16', 'T-57', 'R-179', 'R-183'],
  },
  {
    id: 'ev-15',
    title: 'Invari.QUORUM — epoch-fenced failover',
    status: 'specified',
    laws: [],
    claim:
      'A warm standby takes over through lease ownership, a monotonically increasing epoch and database-level fencing — never a second write authority.',
    evidence: [
      'Prerequisites now exist: a sealed epoch field on ledger entries and receipts, an idempotency-key field on receipts, and the K(t) receipt sweeper.',
    ],
    limits: [
      'The lease mechanism is not built and has not been tested under fault injection. Invari.kOS runs as a single active instance without automated failover.',
    ],
    method: 'Pre-implementation readiness review.',
    refs: ['Claim 9', 'QR-01', 'QR-03', 'QR-10'],
  },
  {
    id: 'ev-16',
    title: 'What is sealed is what was validated',
    status: 'tested',
    laws: [4, 8],
    claim:
      'A policy may adjust a proposal before it is sealed. Whatever it changes, the rules that depend on that value are checked again on the final version, so authority is evaluated over the resulting state, not the state as submitted.',
    evidence: [
      'Every policy declares what it reads, what it may change and in what order it runs. The kernel refuses to start if two policies conflict without saying how, and refuses any change a policy did not declare.',
      'Policies whose rule reads a value another policy changed run again on the final version, and each re-check is recorded in the entry’s trace.',
      'Undeclared changes are caught at any depth: a change inside a nested object is a write like any other (5 Nov 2026).',
      'Recorded live runs: a delivery and an acquisition each re-checked their sealed custody state and firearm identity after adjustment. Before the fix, one such adjustment caused every business-to-business acquisition to be refused.',
      'A firearm acquired while already held is refused against current state (open harness case M6).',
    ],
    limits: [
      'Evaluation is over current state and the declared rules. A general analysis of action sequences beyond current state is not built.',
    ],
    method: 'Check scripts (50 policy-contract checks) and recorded live runs.',
    refs: ['B-10', 'R-168', 'R-117', 'T-67'],
  },
  {
    id: 'ev-17',
    title: 'A bulk import leaves sealed evidence of itself',
    status: 'tested',
    laws: [5, 6],
    claim:
      'When a licensee loads its existing records, the ledger records which file produced which entries — so the old bound book can be closed against something an auditor can check.',
    evidence: [
      'Every entry an import writes names the file’s SHA-256 fingerprint and the row it came from.',
      'One record on the licensee’s own chain seals the file’s fingerprint and size, its row counts, and a digest of every entry the import committed — written whether rows were accepted or refused.',
      'Recorded live run: a verifier given the licensee’s kept file proved it produced exactly those entries; a copy differing by one byte failed; re-uploading the same file was refused.',
    ],
    limits: [
      'Invari does not store the file — the licensee keeps it. Without the exact file, only the entries and their digest can be checked.',
      'The import verifier reads Invari’s database; it is not yet part of the open harness.',
      'The record carries no file name or refusal reasons, since those can contain a person’s details.',
    ],
    method: 'Check scripts and a recorded live run.',
    refs: ['R-167', 'R-23'],
  },
  {
    id: 'ev-18',
    title: 'Corrections append; the original stays',
    status: 'tested',
    laws: [6],
    claim:
      'A wrong entry is corrected by a new entry that references it. The original is never rewritten, and the record shows both.',
    evidence: [
      'A licensee corrects declared fields of an earlier entry with a new correction entry; the original stays on the chain, and the bound book prints the corrected value with a column naming what changed, when and why.',
      'An entry recorded in error closes its record and names the replacement; the bound book keeps the voided row with a note.',
      'Who may correct follows the sealed role of the original; a self-correction is marked as one. Identity fields cannot be corrected in place.',
      'Recorded live runs covered every refusal and both kinds of correction.',
    ],
    limits: [
      'Corrections of facts two licensees share — which would need both to affirm — are designed but not built.',
    ],
    method: 'Check scripts and recorded live runs.',
    refs: ['T-29'],
  },
  {
    id: 'ev-19',
    title: 'Typed regulated facts are checked, not trusted',
    status: 'tested',
    laws: [4],
    claim:
      'Where a person still has to type a regulated fact — who a firearm came from — a malformed value is refused rather than recorded.',
    evidence: [
      'A licensee number must have the structure of a federal firearms license — six segments, a real region, license type and expiration month — and is sealed in one canonical form, so the same licensee is not recorded three ways.',
      'A private party’s address must name a US state and a ZIP code that belongs to it.',
      'A licensee already on Invari that the licensee has received from can be picked instead of typed; the name and number then come from that licensee’s own record.',
      'Recorded live runs: a malformed license number and an out-of-state ZIP were refused with the reason; a number typed without dashes was sealed in canonical form.',
    ],
    limits: [
      'The checks are structural. A well-formed license number is not proof the license was issued or is current.',
      'Licensee numbers recorded at onboarding are not yet held to the same check.',
    ],
    method: 'Check scripts and recorded live runs.',
    refs: ['T-27'],
  },
];

/**
 * Remediation register snapshot. Counted directly from the "Resolution (v4)"
 * column of the workbook's "Remediation Findings" sheet, and
 * matching the counts recorded on its Read Me (185 rows on 6 Nov 2026). Do not add counts from the
 * Bug Register or TODO Register — they cover different scopes.
 */
export const remediationSnapshot = {
  date: '6 November 2026',
  register: 'Remediation Findings register',
  scope:
    'Findings discovered during the kOS v4 remediation itself — through tests, live end-to-end runs and code review — not the original architecture audit.',
  total: 185,
  rows: [
    { key: 'verified', label: 'Fixed — verified', value: 138, note: 'Proven by committed tests or a recorded live run.' },
    { key: 'unexercised', label: 'Fixed — not yet exercised', value: 4, note: 'Code changed; no real application flow has run through it yet.' },
    { key: 'partial', label: 'Partially fixed', value: 5, note: 'Some of the fix is in place; the remainder is recorded.' },
    { key: 'open', label: 'Open', value: 34, note: 'Not yet addressed.' },
    { key: 'other', label: 'Fixed or closed without a recorded verification', value: 4, note: 'Three fixes whose verification is recorded outside the register’s standard wording, and one finding closed as not reproducible.' },
  ],
} as const;
