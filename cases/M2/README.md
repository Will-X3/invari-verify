# M2 -- A stale proposal, refused: formed against v10 after v11 was committed

**Refusal:** `STALE_VERSION`
**Law 02 -- Contemporaneous Validity**
**Receipt:** `rcpt_cd01a265f1d643a297e15b89af191984` -- refused 2026-10-17 21:54:47 UTC
**Chain:** `6abd4a31215382c134b8c544`

## What happened

An acquisition was proposed against version 10 of this firearm's chain, but version 11
had already been committed. A proposal is valid only against the state in force when it
commits, so the kernel rejected it as stale -- no queue, no merge. The proposer
resubmits against the current version.

## Run it

```
node verify-all.js M2
```

Expected:

```
Note: STALE PROPOSAL: the signed bundle claims v10 but signs v11's entryHash -- the head when it was evaluated (signed temporalAnchor 2026-10-17T21:54:47.626Z is after v11 and before v12). ...
RESULT: PASS -- stale proposal: claimed v10, refused at head v11; intact chain; nothing written from it
```

## How the evidence works

The signed receipt carries two values side by side:

| Signed field | Value | Meaning |
|---|---|---|
| `stateVersion` | `10` | the version the proposer claimed to be building on |
| `stateHash` | `3e2782…2dbc` | v11's entryHash -- the head the kernel actually evaluated against |

They differ, and that difference is the stale-version evidence. The verifier accepts it
only because v11 is a *later* version on the same chain and the receipt's signed
`temporalAnchor` falls after v11 was committed and before v12. A signed head that was an
earlier version, or a timestamp outside that window, would fail.

The chain kept moving after the refusal (v12-v16, a shipment and receipt between
licensees); the verifier lists those entries and confirms none came from this receipt.
M6 is a different refusal on the same firearm, 48 seconds earlier.
