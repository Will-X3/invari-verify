/**
 * Open verification harness — published cases anyone can re-run.
 * Source of truth: https://github.com/Will-X3/invari-verify (cases/<ID>/case.json,
 * CHECKPOINTS.md). Mirror a case here only once it is public in the repo and
 * `node verify-all.js` gives its expected result.
 *
 * Published head hashes on this page are an independent copy of CHECKPOINTS.md:
 * never change a published value — add a new case instead.
 */

export const harness = {
  repoUrl: 'https://github.com/Will-X3/invari-verify',
  cloneUrl: 'https://github.com/Will-X3/invari-verify.git',
  /** Runs every case in the repo against its expected result. */
  runAll: 'node verify-all.js',
  requirements: 'Node.js (any current LTS). No npm install, no network, no Invari server.',
  /** Invari's published signing keys, keyed by signingKeyId. */
  publicKeys: [
    {
      keyId: 'k-2026-09',
      algorithm: 'Ed25519',
      pem: '-----BEGIN PUBLIC KEY-----\nMCowBQYDK2VwAyEAtOBsh1EjS7KgXXiFKBwZkf3/38f0GdewpP941KJa2B8=\n-----END PUBLIC KEY-----',
    },
  ],
  /** What a PASS establishes, by kind of case. */
  checks: [
    'Every chain entry’s hash recomputes from its own content, every Ed25519 signature verifies under the published key, and every link is intact.',
    'Kernel refusals (M): the receipt’s input commitment recomputes and its signature verifies — the kernel issued a receipt for exactly this proposal — and the proposal targeted this chain, by the tenant that held it.',
    'Kernel refusals (M): no entry on the chain was written from this receipt, and the signed proposal names the head the kernel evaluated it against, equal to the published checkpoint.',
    'Workflow refusals (R): the refusal record — outcome, reason code, message, actor, the attempt and both chain positions — recomputes and its signature verifies.',
    'Accepted acts (A): every ledger entry and every human affirmation in the export verifies by signature, and every affirmation a ledger entry cites is an AFFIRM.',
    'Entry format v5 (V): entries written since 5 November 2026 also seal the context the kernel evaluated against — the context bundle hash and the instant it was pinned — inside the entry hash; earlier v4 entries verify alongside them.',
  ],
  doesNotProve: [
    'A rejection receipt signs its inputs but not yet its final outcome and reason code; the verifier prints them marked NOT SIGNED. (Since 17 October 2026 the separate refusal record is signed; signing the receipt outcome is open.)',
    'Whoever holds the private key could re-sign a rewritten chain. The defence is a head hash published somewhere Invari cannot rewrite, before the export — recorded in CHECKPOINTS.md.',
    'These cases come from pre-pilot environments holding synthetic data. Their heads were published after the refusals; heads for new refusals are published at the time.',
    'An accepted act (A1) shows the affirmations the entry cites were AFFIRMs when exported; it does not yet check that none of them was retracted before the entry was written.',
  ],
};

export interface HarnessCase {
  id: string;
  title: string;
  /** M: kernel refusal · R: workflow refusal · A / V: accepted act · T: tamper test. */
  kind: 'refusal' | 'record' | 'accepted' | 'tamper';
  refusal: string;
  laws: number[];
  refusedAt: string;
  /** Label for refusedAt; defaults to "Refused". */
  dateLabel?: string;
  summary: string;
  expect: 'PASS' | 'FAIL';
  expected: string;
  publishedHead: { version: string; hash: string } | null;
  note?: string;
  evidenceIds: string[];
}

const PASS = 'RESULT: PASS -- signed proposal against an intact chain; nothing written from it';

export const harnessCases: HarnessCase[] = [
  {
    id: 'M1',
    kind: 'refusal',
    title: 'A second “manufactured” event for an asset that already has one',
    refusal: 'MANUFACTURE_NOT_GENESIS',
    laws: [6],
    refusedAt: '11 Oct 2026',
    summary:
      'A manufacture event can only be the first entry of an asset’s chain. A second one was proposed against v1, and the kernel refused it. Nothing was written.',
    expect: 'PASS',
    expected: PASS,
    publishedHead: { version: 'v1', hash: '67d764054abf00d4533b755c66c4f1bea5f2a4020c409fbe37e8e118ffdc78dc' },
    evidenceIds: ['ev-05', 'ev-06'],
  },
  {
    id: 'M2',
    kind: 'refusal',
    title: 'A stale proposal: formed against v10 after v11 was committed',
    refusal: 'STALE_VERSION',
    laws: [2],
    refusedAt: '17 Oct 2026',
    summary:
      'An acquisition was proposed against version 10 of a firearm’s chain after version 11 had committed. The signed receipt carries both the version the proposer claimed (v10) and the head the kernel actually evaluated (v11) — that difference is the evidence.',
    expect: 'PASS',
    expected:
      'RESULT: PASS -- stale proposal: claimed v10, refused at head v11; intact chain; nothing written from it',
    publishedHead: { version: 'v11', hash: '3e2782129b5207b68de39dcea1c46a2f17458e694e21054ae20d3d9888cc2dbc' },
    note: 'Accepted as stale only because v11 is a later version on the same chain and the receipt’s signed timestamp falls after v11 and before v12. An earlier version, or a timestamp outside that window, fails.',
    evidenceIds: ['ev-02'],
  },
  {
    id: 'M3',
    kind: 'refusal',
    title: 'A sale to a customer without an executed Form 4473',
    refusal: 'regulatory.atf — 27 CFR 478.124',
    laws: [4, 7],
    refusedAt: '2 Oct 2026',
    summary:
      'A disposition to a customer was proposed without the executed Form 4473 that federal regulation requires. Required evidence was missing, so the kernel refused the transfer. Nothing was written.',
    expect: 'PASS',
    expected: PASS,
    publishedHead: { version: 'v1', hash: 'e1efd785431566b6b8e6c6a233288bca8e89c60dbe865fe94e7ea90edd555fdb' },
    evidenceIds: ['ev-06', 'ev-09'],
  },
  {
    id: 'M6',
    kind: 'refusal',
    title: 'Acquiring a firearm already in the licensee’s inventory',
    refusal: 'DUPLICATE_ACQUISITION',
    laws: [8],
    refusedAt: '17 Oct 2026',
    summary:
      'Each acquisition is ordinary on its own; together they would produce an impossible state — one firearm held twice. The kernel refused the second. The chain kept moving afterwards (v12–v16); the verifier lists those entries and confirms none came from this receipt.',
    expect: 'PASS',
    expected: PASS,
    publishedHead: { version: 'v11', hash: '3e2782129b5207b68de39dcea1c46a2f17458e694e21054ae20d3d9888cc2dbc' },
    evidenceIds: ['ev-06', 'ev-16'],
  },
  {
    id: 'T1',
    kind: 'tamper',
    title: 'Tamper test: M1’s evidence with one sealed field edited',
    refusal: 'expected failure',
    laws: [6],
    refusedAt: '—',
    summary:
      'One field inside M1’s sealed v1 entry was changed. The verifier must fail — and for the right reason: the edited entry no longer matches its own hash. Committed so you can see what a failure looks like.',
    expect: 'FAIL',
    expected: 'RESULT: FAIL\n  - chain: 6acbe57e799dbf0fcf8def65 v1: content does not match entryHash',
    publishedHead: null,
    evidenceIds: ['ev-05'],
  },
  {
    id: 'R1',
    kind: 'record',
    title: 'Receiving a transfer that was already completed',
    refusal: 'TRANSFER_RECEIVE_REFUSED',
    laws: [6],
    refusedAt: '25 Oct 2026',
    summary:
      'The receiving licensee asked to receive a transfer a second time, after it had been received and completed. The transfer workflow refused it before anything reached the kernel, so there is no receipt. The evidence is the refusal record itself, sealed whole and signed: outcome, reason, message, actor, the attempt and both chain positions.',
    expect: 'PASS',
    expected: 'RESULT: PASS -- a refusal signed by Invari, outcome and reason included',
    publishedHead: null,
    evidenceIds: ['ev-06'],
  },
  {
    id: 'A1',
    kind: 'accepted',
    title: 'An onboarding, and the three signed affirmations behind it',
    refusal: 'accepted act',
    laws: [],
    refusedAt: '27 Oct 2026',
    dateLabel: 'Exported',
    summary:
      'Before the kernel would write a licensee’s genesis entry, three human judgments had to be made in order — the license is real and active, the operator is legitimate, the licensee is authorized onto the platform — each a signed affirmation. The export carries the chain and all three; each verifies by signature, and each one the entry cites is an AFFIRM.',
    expect: 'PASS',
    expected:
      '3 signed affirmation(s) verified\n3 affirmation(s) cited by ledger entries in this export, each an AFFIRM\nRESULT: PASS',
    publishedHead: null,
    evidenceIds: ['ev-05', 'ev-09'],
  },
  {
    id: 'T2',
    kind: 'tamper',
    title: 'Tamper test: R1’s record with the signed message edited',
    refusal: 'expected failure',
    laws: [6],
    refusedAt: '—',
    summary:
      'One word of R1’s signed message was changed — “Current: completed” became “Current: accepted”, as if the transfer had never been received. Nothing else changed, including the stored hash and signature. The verifier must fail.',
    expect: 'FAIL',
    expected:
      'RESULT: FAIL\n  - entryHash does not match the record\'s contents -- a field was altered after it was written',
    publishedHead: null,
    evidenceIds: ['ev-06'],
  },
  {
    id: 'T3',
    kind: 'tamper',
    title: 'Tamper test: A1 with one affirmation’s question rewritten and every root recomputed',
    refusal: 'expected failure',
    laws: [],
    refusedAt: '—',
    summary:
      'The legitimacy question the officer actually answered was replaced with a softer one, and every section root and the master root were recomputed — as a careful forger would leave it. Roots alone would not catch it; the signature on the affirmation does.',
    expect: 'FAIL',
    expected:
      'RESULT: FAIL\n  - affirmationArtifacts affirmation 6ae112a4465f89eca27ae84b: content does not match entryHash\n  - affirmationArtifacts: 2 record(s) verified by signature, at least 3 required',
    publishedHead: null,
    evidenceIds: ['ev-05'],
  },
  {
    id: 'V1',
    kind: 'accepted',
    title: 'Entry format v5: context anchors sealed inside each entry',
    refusal: 'accepted act',
    laws: [5, 6],
    refusedAt: '7 Nov 2026',
    dateLabel: 'Exported',
    summary:
      'A licensee’s export holding both entry formats: 26 entries over seven chains, v4 entries from before 5 November and v5 entries after — a firearm’s delivery and acquisition, and the export’s own record. Each v5 entry seals the context the kernel evaluated it against, inside the hash the signature covers.',
    expect: 'PASS',
    expected:
      'Entries checked: 26\nNote: masterRootHash verified (SHA-256(section roots, document order))\nRESULT: PASS',
    publishedHead: { version: 'v6', hash: 'dbbf54a2c49913739f4ca4239038703c215c217ca6c3adf87aca11c2db0ceef1' },
    note: 'The firearm’s chain starts at v5 in this file: v1–v4 are on the manufacturer’s book, so it is reported as a partial chain whose first link points outside the export.',
    evidenceIds: ['ev-05'],
  },
  {
    id: 'T4',
    kind: 'tamper',
    title: 'Tamper test: V1 with one entry’s context anchor rewritten and every root recomputed',
    refusal: 'expected failure',
    laws: [5, 6],
    refusedAt: '—',
    summary:
      'One character of one entry’s context bundle hash was changed, and every root recomputed. Ledger roots are built from entry hashes the forger cannot change without the key, so every root still verifies — only the entry’s own hash catches the edit.',
    expect: 'FAIL',
    expected: 'RESULT: FAIL\n  - 6ade48cfb5d791882f225948 v5: content does not match entryHash',
    publishedHead: null,
    evidenceIds: ['ev-05'],
  },
];

// Same order as `node verify-all.js` prints them.
harnessCases.sort((a, b) => a.id.localeCompare(b.id));
