# M1 -- A second "manufactured" event, refused

**Refusal:** `MANUFACTURE_NOT_GENESIS`
**Law 06 -- History Cannot Be Erased**
**Receipt:** `rcpt_88524a38e31849d08063a6083705e8aa` -- refused 2026-10-11 19:39:46 UTC

## What happened

A second `Firearm_Manufactured` was proposed for a firearm whose chain already begins
with one (asset `6acbe57e799dbf0fcf8def65`, head v1). A manufacture event can only be
the first entry of an asset's chain, so the kernel refused it. Nothing was written.

## Run it

```
node verify-all.js M1
```

Expected: `RESULT: PASS -- signed proposal against an intact chain; nothing written from it`

The export also contains one entry from Invari's platform ledger: the record of this
export itself (`Chain_Export_Completed`). It is reported as a partial chain because its
earlier entries are not part of this export.
