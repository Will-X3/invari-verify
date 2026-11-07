# T4 -- Tamper test: a context anchor rewritten

V1's export with **one character** of one entry's `contextBundleHash` changed: the
AT-9's v5 entry (`6ade48cfb5d791882f225948`, `Delivery_Completed`), `...4015` ->
`...4010`. Every root was then recomputed, as a careful forger would leave the file.
Ledger roots are built from the entries' `entryHash` values, which the forger cannot
change without the private key, so the recomputed roots are the same as before --
**every root in the file verifies**.

## Run it

```
node verify-all.js T4
```

Expected: `RESULT: FAIL` -- `6ade48cfb5d791882f225948 v5: content does not match
entryHash`. Nothing else fails: the context the kernel evaluated against is covered
by the entry's own hash and signature, so it cannot be swapped after the fact without
the change showing on that entry.
