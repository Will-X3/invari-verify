# M3 -- A sale to a customer without an executed Form 4473, refused

**Refusal:** `regulatory.atf -- 27 CFR 478.124`
**Law 04 -- Uncertainty Can Only Reduce Authority; Law 07 -- Irreversibility Requires Stronger Authority**
**Receipt:** `rcpt_c4b57d429f4f4a7fa3c79abaeea33dc4` -- refused 2026-10-02 00:06:32 UTC
**Chain:** `6abef588901bd31bbfe862d3`

## What happened

A disposition of a firearm to a customer was proposed without the executed Form 4473 that federal regulation (27 CFR 478.124) requires. Required evidence was missing, so the kernel refused the transfer. Nothing was written.

## Run it

```
node verify-all.js M3
```

Expected: `RESULT: PASS -- signed proposal against an intact chain; nothing written from it`

## Note

This refusal predates 17 October 2026, so only its receipt -- not its refusal record -- is sealed and signed. The receipt is what this verifier checks.
