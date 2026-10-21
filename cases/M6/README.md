# M6 -- Acquiring a firearm already in the licensee's inventory, refused

**Refusal:** `DUPLICATE_ACQUISITION`
**Law 08 -- Composition Cannot Manufacture Authority**
**Receipt:** `rcpt_003e54424b034e9b95ba1a5d6b462442` -- refused 2026-10-17 21:53:59 UTC
**Chain:** `6abd4a31215382c134b8c544`

## What happened

A licensee proposed acquiring a firearm that was already in its own inventory, with no disposition recorded since its last acquisition. Each acquisition is individually ordinary; together they would produce an impossible state -- one firearm held twice. The kernel refused it.

## Run it

```
node verify-all.js M6
```

Expected: `RESULT: PASS -- signed proposal against an intact chain; nothing written from it`

## Note

Same firearm as M2. Since 17 October 2026 the separate refusal record is also sealed and signed; this verifier checks the receipt.
