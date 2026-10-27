# T3 -- Tamper test: an affirmation's question rewritten

A1's export with the s3 affirmation's prompt changed from the legitimacy question the
officer actually answered to "Does this entity look fine at a glance?". The section's
rootHash and the masterRootHash were then **recomputed**, so every root in the file is
consistent -- as a careful forger would leave it.

## Run it

```
node verify-all.js T3
```

Expected: `RESULT: FAIL` -- the s3 affirmation's content no longer matches its
entryHash, so only 2 of the required 3 verify by signature. Roots alone would not
have caught this; the signature on each affirmation does.
