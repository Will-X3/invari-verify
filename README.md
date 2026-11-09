# invari-verify

Evidence you can check without trusting Invari.

Each folder in `cases/` is real evidence from Invari.kOS: a proposal it **refused**,
exported with its signed chain and its signed receipt -- or, in A cases, a regulated
act it **accepted** together with the signed human judgments behind it -- plus the
verifier source. You need only
Node.js (any current LTS) and Invari's public key. No npm install, no network, no
Invari server.

All data is synthetic, pre-pilot test data.

## Run every case

```
node verify-all.js
```

```
Case    Expected   Got
------  ---------  -------  ------------
A1      PASS       PASS     as expected
A2      PASS       PASS     as expected
A3      PASS       PASS     as expected
M1      PASS       PASS     as expected
M2      PASS       PASS     as expected
M3      PASS       PASS     as expected
M6      PASS       PASS     as expected
R1      PASS       PASS     as expected
T1      FAIL       FAIL     as expected
T2      FAIL       FAIL     as expected
T3      FAIL       FAIL     as expected
T4      FAIL       FAIL     as expected
T5      FAIL       FAIL     as expected
T6      FAIL       FAIL     as expected
V1      PASS       PASS     as expected

ALL CASES AS EXPECTED
```

Run one case with its full output: `node verify-all.js M1`

## Don't trust this folder's key

`public-keys.json` must match the key published at
<https://invari.systems/#verify-yourself>. A forged repository could ship its own key.
Compare them before you trust any PASS.

## Cases

| Case | What it shows | Law | Expected |
|------|---------------|-----|----------|
| [A1](cases/A1) | A licensee's onboarding, and the three signed affirmations (license verified, legitimacy judged, onboarding authorized) the ledger entry cites | -- | PASS |
| [A2](cases/A2) | An onboarding whose four gates the kernel checked **inside the commit**, at its own pinned time, and the gate reads it sealed in the entry | 02, 05, 06 | PASS |
| [A3](cases/A3) | An affirmation withdrawn and given again: the whole affirmation chain, and the entry cites the one in force, not the withdrawn one | 02, 06 | PASS |
| [M1](cases/M1) | A second "manufactured" event for an asset that already has one (`MANUFACTURE_NOT_GENESIS`) | 06 History Cannot Be Erased | PASS |
| [M2](cases/M2) | A stale proposal: formed against v10 after v11 was committed (`STALE_VERSION`) | 02 Contemporaneous Validity | PASS |
| [M3](cases/M3) | A sale to a customer without an executed Form 4473 (27 CFR 478.124) | 04, 07 | PASS |
| [M6](cases/M6) | Acquiring a firearm already in the licensee's inventory (`DUPLICATE_ACQUISITION`) | 08 Composition Cannot Manufacture Authority | PASS |
| [R1](cases/R1) | Receiving a transfer already completed -- a workflow refusal, recorded and signed (`TRANSFER_RECEIVE_REFUSED`) | 06 | PASS |
| [T1](cases/T1) | M1 with one sealed field edited -- a tamper test | 06 | **FAIL** |
| [T2](cases/T2) | R1 with its signed message edited -- a tamper test | 06 | **FAIL** |
| [T3](cases/T3) | A1 with one affirmation's prompt rewritten and every root recomputed -- a tamper test | -- | **FAIL** |
| [T4](cases/T4) | V1 with one entry's `contextBundleHash` edited and every root recomputed -- a tamper test | 05, 06 | **FAIL** |
| [T5](cases/T5) | A2 with the newest affirmation removed and every root recomputed -- the chain still looks whole; the sealed gate reads catch it | 02, 06 | **FAIL** |
| [T6](cases/T6) | A3 with the withdrawal removed and every root recomputed -- a withdrawn judgment brought back | 06 | **FAIL** |
| [V1](cases/V1) | Entry format v5: v4 entries and v5 entries carrying sealed context anchors, in one licensee export | 05 Consequence Requires Provenance, 06 | PASS |

M cases are refused by the kernel: the evidence is a signed proposal, a receipt and
the chain. R cases are refused by the workflow before anything reaches the kernel, so
there is no receipt: the evidence is the sealed refusal record, checked by
`kernel/tools/verifyRefusalRecord.js`. A and V cases are accepted acts: the evidence is a
whole chain export, checked by `kernel/tools/verifyExport.js` -- every ledger entry,
every signed affirmation, and that each affirmation the entry cites is an AFFIRM.

## What a PASS checks

1. **The chain.** Every entry's hash recomputes from its own content (SHA-256 over
   `invari.kos.ledger.entry.v4\n` + canonical JSON), every Ed25519 signature verifies
   under the published key, versions start at v1 and every `previousEntryHash` links.
   An entry in format v5 must also carry its context anchors (`contextBundleHash`,
   `contextSnapshotTimestamp`), which are inside that hash (V1, T4).
2. **The receipt.** Its `inputCommitHash` recomputes from `{tenantId, proposal}` and
   its signature verifies: Invari's kernel issued a receipt for exactly this proposal.
3. The proposal was for this asset, formed against the stated version, by the tenant
   that held it.
4. No entry on the chain was written from this receipt.
5. The signed proposal names the head it was evaluated against, and (with
   `expectHead`) that head equals the checkpoint in [CHECKPOINTS.md](CHECKPOINTS.md).

For an export (A and V cases), also:

6. **Affirmation chains** (exports from 3.3.0 on). Each human judgment is a link in its
   subject's chain: numbered 1..n with no gap, each naming the hash of the one before,
   every withdrawal (RETRACT) pointing back at an earlier AFFIRM of the same gate. The
   export carries the whole chain of every subject an entry cites, and each cited
   affirmation must still have been in force -- the gate's latest record -- when the
   entry was committed (A3, T6).
7. **Gate reads.** An entry whose gates the kernel checked inside the commit carries
   `gateReads`: what it read of the affirmation chain at that moment, sealed in the
   entry. The chain in the export must agree -- the head it read, each gate record, and
   `evidenceRefs` exactly those records. This is what catches a deleted *newest* record,
   which leaves no gap behind it (A2, T5).

**Stale proposals (M2).** The signed bundle carries the version the proposer *claimed*
and the head the kernel *actually evaluated against*. For a stale proposal those differ
-- that difference is the evidence. The verifier accepts it only if the signed head is a
**later** version on the same chain and the receipt's signed timestamp falls after that
version and before the next one, so it really was the head at the moment of refusal.
A signed head that is an earlier version, or a timestamp outside that window, fails.

## What it does NOT prove -- stated plainly

- **The receipt's outcome is not yet signed.** "REJECTED" and the reason code are
  written when the receipt is finalized, outside the signature, so the verifier prints
  them marked `NOT SIGNED`. Checks 2-5 are what make a refusal credible: a signed
  proposal against an intact chain, and nothing written from it. (Since 17 October
  2026 the separate refusal *record* is sealed and signed; signing the receipt outcome
  is on the roadmap.)
- **A chain's newest record is protected only by an entry that relied on it.** Deleting
  the last affirmation of a subject leaves an intact-looking chain; the deletion is
  caught when a sealed entry's gate reads name it (T5). Onboardings committed before
  9 November 2026 have no gate reads (A3).
- **Package signatures are not in exports yet.** A signature on a whole policy package
  (recorded on Invari's own chain since 9 November 2026) can be checked inside Invari
  but not yet from this folder.
- **Whoever holds Invari's private key could re-sign a rewritten chain.** The defence
  is a head hash published somewhere Invari can't rewrite, *before* the export -- see
  [CHECKPOINTS.md](CHECKPOINTS.md).

## Try to break it

Change any value inside a chain entry in a case's `asset-export.json` and run that
case again. It reports `RESULT: FAIL` and names the entry. Case T1 is exactly that,
committed so you can see what a failure looks like.

## Layout

```
public-keys.json   Invari's published signing keys (compare with invari.systems)
CHECKPOINTS.md     published chain heads, one per case, with dates
verify-all.js      runs every case against its expected result
kernel/            the verifier source -- canonicalize.js, seal.js, entryFormat.js,
                   affirmationChain.js, gateCheck.js, glyphAffirmationChain.js, tools/
cases/<ID>/        README.md, case.json, asset-export.json, receipt-<id>.json
                   (R cases: README.md, case.json, refusal-record.json)
```
