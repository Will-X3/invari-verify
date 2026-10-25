# T2 -- Tamper test: R1's record with the signed message edited

**Refusal:** `TRANSFER_RECEIVE_REFUSED` (tampered copy)
**Law 06 -- History Cannot Be Erased**

R1's record with one word of the signed message changed: "Current: completed" became
"Current: accepted", as if the transfer had never been received. Nothing else changed,
including the stored entryHash and signature.

## Run it

```
node verify-all.js T2
```

Expected: `RESULT: FAIL` -- `entryHash does not match the record's contents`.
