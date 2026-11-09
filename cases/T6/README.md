# T6 -- Tamper test: a withdrawal removed

A3's export with record #2 -- the RETRACT that withdrew the first s2 affirmation --
deleted, and every root **recomputed**.

Without it, the first s2 affirmation would look like it was never withdrawn. Because a
gate's state is its latest record, deleting a withdrawal is how someone would try to
bring a withdrawn judgment back.

## Run it

```
node verify-all.js T6
```

Expected: `RESULT: FAIL` -- `CHAIN_GAP` (expected #2, found #3) and `CHAIN_LINK` (#3
names a record that is not there). The note reads `1 BROKEN`.
