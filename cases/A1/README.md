# A1 -- An onboarding, and the signed affirmations behind it

**Subject:** Disturbance Tactical (FFL), entity `6ae112b4465f89eca27ae89f`
**Export:** platform chain export, format 3.2.0, 2026-10-27 21:20:27 UTC

## What happened

A Platform Compliance Officer onboarded a licensee. Before the kernel would write
the genesis entry (`Entity_Onboarded`, v1), three human judgments had to be made, in
order, each recorded as a signed affirmation:

| Gate | Question | Response |
|------|----------|----------|
| s2 | Is the license real, active, and the licensee's? | AFFIRM |
| s3 | Is this a legitimate operator, with no sign of bad faith? | AFFIRM |
| s5 | Is this licensee authorized onto the platform? | AFFIRM |

The genesis entry cites all three in `evidenceRefs`. The export carries the entity's
chain, Invari's own record of the export (on Invari's ledger), and the three
affirmations.

## Run it

```
node verify-all.js A1
```

Expected: `RESULT: PASS`, with `3 signed affirmation(s) verified` and
`3 affirmation(s) cited by ledger entries in this export, each an AFFIRM`.

The case requires the three affirmations to verify **by signature** -- prompt,
response, evidence, the officer and their role, the time and the policy hash they
were made under are all inside it. An export in an older format, where they could
only be checked as a block, does not pass this case.

The export record is v5 of Invari's ledger chain; its link to v4 (an earlier export
of the same licensee) is outside this file, so it is reported as a partial chain.
