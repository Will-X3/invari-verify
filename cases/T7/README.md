# T7 -- Tamper test: a dealer given a manufacturing title

V2's export with one sealed fact rewritten: in `Authority_Admitted` 1.1.0, the
receiving clerk's title (`licensee_e2`) has `Firearm_Manufactured` added to the
events it may record -- a dealer's clerk given a power the dealer's licence never
had. Every root was then recomputed, as a careful forger would leave the file.

## Run it

```
node verify-all.js T7
```

Expected: `RESULT: FAIL` -- that entry's `content does not match entryHash`. A
business's authority is sealed in its own chain: it cannot be widened after the
fact without the change showing on the entry that declared it.
