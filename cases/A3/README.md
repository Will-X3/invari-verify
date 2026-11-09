# A3 -- An affirmation withdrawn and given again

A licensee's onboarding (Vanta Firearms, synthetic). The compliance officer affirmed
the license check (s2), **withdrew it** (a RETRACT, reason recorded), affirmed it again,
then cleared s2b, s3 and s5 -- six records in one chain:

| # | Gate | Response |
|---|------|----------|
| 1 | s2 | AFFIRM (withdrawn by #2) |
| 2 | s2 | RETRACT of #1 |
| 3 | s2 | AFFIRM |
| 4 | s2b | AFFIRM |
| 5 | s3 | AFFIRM |
| 6 | s5 | AFFIRM |

The export carries the **whole** chain, not only the records the ledger entry cites, so
you can see the withdrawal and check that the entry cites #3 -- the affirmation in force
when it was written -- and not the withdrawn #1.

This onboarding was committed before the kernel checked gates inside the commit, so
its entry has no `gateReads` (A2 has them).

## Run it

```
node verify-all.js A3
```

Expected: `RESULT: PASS` -- six chained affirmations verified, the chain intact, and
`4 cited affirmation(s) still in force at their commit`.

T6 is this file with the withdrawal removed.
