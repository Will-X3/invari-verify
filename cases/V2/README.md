# V2 -- Job titles the kernel derived from a licence

A synthetic licensed dealer (FFL type 01, "Mesa Example Arms") onboarded on a fresh
platform -- genesis, the platform's own package (package #0), then the business -- and
exported by its owner. Every entry is entry format v7 and names the platform policy
it was evaluated under (`platformPolicyRef`, mode `PACKAGE`).

What the chain records:

- **`Entity_Onboarded`** seals the submission, including the licence type (`01`).
- **`Authority_Admitted` 1.0.0** declares the business's job titles. They are not
  chosen by anyone: the kernel derived them from the roles in the certified
  `b2b_transfer` package and narrowed them to what a dealer's licence records
  (27 CFR 478.125(e), acquisitions). There is no manufacturing title -- under the
  same package, a manufacturer gets six.
- **`Authority_Admitted` 1.1.0** is the owner naming those titles ("Receiving
  clerk", "Store manager"). A name is a label: the events each title may record stay
  as derived.
- The owner's invitation of a receiving clerk, by job title.
- The export's own record.

## Run it

```
node verify-all.js V2
```

Expected: `RESULT: PASS`. Its head is published in [CHECKPOINTS.md](../../CHECKPOINTS.md).

Whether each human act was within its actor's job title, and whether the job titles
were within what the licence derives, is checked by the platform's `verifyChains`
against the platform chain; this folder checks that what was sealed is what you see.
T7 shows why that matters.
