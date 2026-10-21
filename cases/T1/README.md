# T1 -- Tamper test (expected: FAIL)

This is M1's evidence with **one field edited** inside the sealed v1 entry
(`eventType` changed to `Firearm_Manufactured_EDITED`). Nothing else differs.

## Run it

```
node verify-all.js T1
```

Expected:

```
RESULT: FAIL
  - chain: 6acbe57e799dbf0fcf8def65 v1: content does not match entryHash
```

The verifier must fail, and it must fail for this reason -- the edited entry no longer
matches its own hash. A tamper test that failed for some other reason would not count.
