# T5 -- Tamper test: the newest affirmation removed

A2's export with affirmation #4 (s5, "onboarding authorized") deleted. The section's
`rootHash`, `recordCount` and the `masterRootHash` were then **recomputed**, so every
root is consistent -- as a careful forger would leave it.

What remains is a perfectly good chain, #1 to #3: removing the **last** link of a chain
leaves nothing broken behind it. That is why the chain alone is not enough.

## Run it

```
node verify-all.js T5
```

Expected: `RESULT: FAIL` -- `gateReads.chainHead #4 is missing from the subject's chain`
and `gate s5: the record the commit read (#4) is not in the chain as sealed`. The note
still says the chain is intact: it is. What catches the deletion is the kernel's own
sealed record of what it read when it committed the entry.
