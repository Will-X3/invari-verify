# R1 -- Receiving a transfer that was already completed, refused

**Refusal:** `TRANSFER_RECEIVE_REFUSED`
**Law 06 -- History Cannot Be Erased**
**Record:** `6ade6817480788a722888a45` -- refused 2026-10-25 20:35:35 UTC

## What happened

The receiving licensee's Owner asked to receive transfer `6ade49d8b5d791882f226505`
a second time, after it had been received and completed. The transfer workflow
refused it ("Transfer must be shipped first. Current: completed") before anything
was proposed to the kernel, so there is no proposal and no receipt. The refusal was
recorded on the licensee's entity chain.

## What this case is different from M1-M6

M1-M6 are kernel refusals: the evidence is a signed proposal and a chain with nothing
written from it, and the receipt's outcome is not signed. R1 is a workflow refusal:
the evidence is the refusal record itself, and the whole record is signed -- outcome,
reason code, message, actor, the attempt, and both chain positions. Change any of
them and the record fails (see T2).

## Run it

```
node verify-all.js R1
```

Expected: `RESULT: PASS -- a refusal signed by Invari, outcome and reason included`

It is the first refusal on this licensee's entity chain (scope sequence 1) and the
actor's second (actor sequence 2). The actor's first record is not included, so the
link to it is reported as not checked.
