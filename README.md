# invari-verify

Evidence you can check without trusting Invari.

Each folder in `cases/` is a real proposal that **Invari.kOS refused**, exported with
its signed chain and its signed receipt, plus the verifier source. You need only
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
M1      PASS       PASS     as expected
M2      PASS       PASS     as expected
M3      PASS       PASS     as expected
M6      PASS       PASS     as expected
R1      PASS       PASS     as expected
T1      FAIL       FAIL     as expected
T2      FAIL       FAIL     as expected

ALL CASES AS EXPECTED
```

Run one case with its full output: `node verify-all.js M1`

## Don't trust this folder's key

`public-keys.json` must match the key published at
<https://invari.systems/#verify-yourself>. A forged repository could ship its own key.
Compare them before you trust any PASS.

## Cases

| Case | What was refused | Law | Expected |
|------|------------------|-----|----------|
| [M1](cases/M1) | A second "manufactured" event for an asset that already has one (`MANUFACTURE_NOT_GENESIS`) | 06 History Cannot Be Erased | PASS |
| [M2](cases/M2) | A stale proposal: formed against v10 after v11 was committed (`STALE_VERSION`) | 02 Contemporaneous Validity | PASS |
| [M3](cases/M3) | A sale to a customer without an executed Form 4473 (27 CFR 478.124) | 04, 07 | PASS |
| [M6](cases/M6) | Acquiring a firearm already in the licensee's inventory (`DUPLICATE_ACQUISITION`) | 08 Composition Cannot Manufacture Authority | PASS |
| [R1](cases/R1) | Receiving a transfer already completed -- a workflow refusal, recorded and signed (`TRANSFER_RECEIVE_REFUSED`) | 06 | PASS |
| [T1](cases/T1) | M1 with one sealed field edited -- a tamper test | 06 | **FAIL** |
| [T2](cases/T2) | R1 with its signed message edited -- a tamper test | 06 | **FAIL** |

M cases are refused by the kernel: the evidence is a signed proposal, a receipt and
the chain. R cases are refused by the workflow before anything reaches the kernel, so
there is no receipt: the evidence is the sealed refusal record, checked by
`kernel/tools/verifyRefusalRecord.js`.

## What a PASS checks

1. **The chain.** Every entry's hash recomputes from its own content (SHA-256 over
   `invari.kos.ledger.entry.v4\n` + canonical JSON), every Ed25519 signature verifies
   under the published key, versions start at v1 and every `previousEntryHash` links.
2. **The receipt.** Its `inputCommitHash` recomputes from `{tenantId, proposal}` and
   its signature verifies: Invari's kernel issued a receipt for exactly this proposal.
3. The proposal was for this asset, formed against the stated version, by the tenant
   that held it.
4. No entry on the chain was written from this receipt.
5. The signed proposal names the head it was evaluated against, and (with
   `expectHead`) that head equals the checkpoint in [CHECKPOINTS.md](CHECKPOINTS.md).

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
kernel/            the verifier source -- canonicalize.js, seal.js, tools/
cases/<ID>/        README.md, case.json, asset-export.json, receipt-<id>.json
                   (R cases: README.md, case.json, refusal-record.json)
```
