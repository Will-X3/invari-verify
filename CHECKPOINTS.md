# Published chain heads

Each case's verifier compares the chain head against the value recorded here
(`--expect-head`). A head hash published **before** an export is the defence against
a rewritten, re-signed chain: Invari can't change what you already saw.

Git history timestamps every line in this file. Never edit a published row -- add a new one.

| Case | Asset | Head version | Head entryHash | Refusal time (UTC) | Head published |
|------|-------|--------------|----------------|--------------------|----------------|
| M1 | `6acbe57e799dbf0fcf8def65` | v1 | `67d764054abf00d4533b755c66c4f1bea5f2a4020c409fbe37e8e118ffdc78dc` | 2026-10-11 19:39:46 | After the refusal, with the evidence (2026-10-11) |

From M2 on, head hashes are published at the time of the refusal.
