# V1 -- Entry format v5: context anchors inside the seal

**Subject:** Forge Firearms (FFL), entity `6ade4321b5d791882f224f7c`
**Export:** licensee chain export, format 3.2.0, 2026-11-07 02:52:10 UTC

## What it shows

Since 5 November 2026 every ledger entry is written in **entry format v5**: besides
the policy, nature and authority hashes, it seals the context the kernel evaluated
the proposal against -- `contextBundleHash` (the static context, e.g. the licensee's
own facts) and `contextSnapshotTimestamp` (the instant that context was pinned).
Both are inside `entryHash`, so they are signed with the rest of the entry.

Entries written earlier stay v4 forever: the verifier reads both. This export holds
both kinds -- 26 entries over seven chains:

| Chain | Versions | Format |
|-------|----------|--------|
| the licensee's entity chain | v1-v8 / v9 | v4 / **v5** (v9 is this export's own record) |
| Ashe'tech AT-9 Compact `...5948` | v5-v6 | **v5** -- delivery and acquisition, 2026-11-06 |
| five other firearms | various | v4 |

The AT-9 chain starts at v5: v1-v4 (manufacture, carrier, shipment, the sender's
delivery record) are on the manufacturer's book, outside this file, so it is
reported as a partial chain -- its first `previousEntryHash` points to an entry in the
manufacturer's export.

## Run it

```
node verify-all.js V1
```

Expected: `RESULT: PASS` -- every entry's hash recomputes and its signature verifies,
every v5 entry carries well-formed context anchors, every chain links, and every
section root and the masterRootHash recompute.

The licensee was onboarded on 25 October 2026, before affirmations were sealed and
signed one by one, so its three onboarding affirmations verify only as a block (the
legacy formula). A1 is the case for signed affirmations.
