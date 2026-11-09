# A2 -- An onboarding whose gates the kernel checked in the commit

A licensee's onboarding (Legion Firearms, synthetic) and the four signed affirmations
behind it -- license verified (s2), responsible persons checked against ATF records
(s2b), legitimacy judged (s3), onboarding authorized (s5).

What is new since A1:

- **Each affirmation is a link in a chain** (`sealFormatVersion` 3): numbered 1..4 for
  this submission, each naming the hash of the one before it.
- **The kernel checked the gates itself, inside the commit,** at the moment it pinned
  for the entry -- and sealed what it read in the entry: `gateReads` names the
  submission, the bundle the gates were judged under (`entity_onboarding@1.3.0`), the
  head of the affirmation chain it saw (#4) and, for each gate, the record, its place
  and its hash. `evidenceRefs` are exactly those four records, in the same order.

## Run it

```
node verify-all.js A2
```

Expected: `RESULT: PASS`, with the notes `1 affirmation chain(s) checked, all intact;
4 cited affirmation(s) still in force at their commit` and `1 of 1 gated entry: gate
reads match the exported affirmation chain`.

T5 is this file with the newest affirmation removed.
