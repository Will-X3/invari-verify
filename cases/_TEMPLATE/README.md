# M? -- <one line: what was refused>

**Refusal:** `<REASON_CODE>`
**Law <NN> -- <Law title>**
**Receipt:** `rcpt_...` -- refused <YYYY-MM-DD HH:MM:SS> UTC

## What happened

<Two or three sentences, plain language: who proposed what, against which version,
and why the kernel refused it. Nothing was written.>

## Run it

```
node verify-all.js M?
```

Expected: `RESULT: PASS -- signed proposal against an intact chain; nothing written from it`

<Anything unusual in this case's output, e.g. later entries on the chain, a partial
platform-ledger chain, a stale-version proposal formed against an older head.>
