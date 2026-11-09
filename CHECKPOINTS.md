# Published chain heads

Each case's verifier compares the chain head against the value recorded here
(`--expect-head`). A head hash published **before** an export is the defence against
a rewritten, re-signed chain: Invari can't change what you already saw.

Git history timestamps every line in this file. Never edit a published row -- add a new one.

| Case | Asset | Head version | Head entryHash | Refusal time (UTC) | Head published |
|------|-------|--------------|----------------|--------------------|----------------|
| M1 | `6acbe57e799dbf0fcf8def65` | v1 | `67d764054abf00d4533b755c66c4f1bea5f2a4020c409fbe37e8e118ffdc78dc` | 2026-10-11 19:39:46 | After the refusal, with the evidence (2026-10-11) |
| M2 | `6abd4a31215382c134b8c544` | v11 (proposal claimed v10) | `3e2782129b5207b68de39dcea1c46a2f17458e694e21054ae20d3d9888cc2dbc` | 2026-10-17 21:54:47 | After the refusal, with the evidence (2026-10-21) |
| M3 | `6abef588901bd31bbfe862d3` | v1 | `e1efd785431566b6b8e6c6a233288bca8e89c60dbe865fe94e7ea90edd555fdb` | 2026-10-02 00:06:32 | After the refusal, with the evidence (2026-10-21) |
| M6 | `6abd4a31215382c134b8c544` | v11 | `3e2782129b5207b68de39dcea1c46a2f17458e694e21054ae20d3d9888cc2dbc` | 2026-10-17 21:53:59 | After the refusal, with the evidence (2026-10-21) |
| V1 | `6ade48cfb5d791882f225948` | v6 (entry format 5) | `dbbf54a2c49913739f4ca4239038703c215c217ca6c3adf87aca11c2db0ceef1` | -- (accepted act, 2026-11-06 00:35:16) | After the export, with the evidence (2026-11-06) |
| V1 | `entity::6ade4321b5d791882f224f7c` | v9 (entry format 5) | `24222ef204ffa81bad5230401027e5205a63206497e211407257e1cd5ea6faac` | -- (the export's own record, 2026-11-07 02:52:09) | After the export, with the evidence (2026-11-06) |
| A2 | `entity::6af141abfd9c9a28ce26d730` | v5 (the export's own record) | `a1b9ea41dc92990061eceb433198204633787db73e66aa7b2cda0203e5117411` | -- (accepted act; onboarding 2026-11-09 03:44:43) | After the export, with the evidence (2026-11-09) |
| A3 | `entity::6af13ae1061a867dcfe13324` | v5 (the export's own record) | `a34c3489b5bbb859c5691fe07d620d9461bf55cd88e9af82ae566210417f6378` | -- (accepted act; onboarding 2026-11-09 03:15:45) | After the export, with the evidence (2026-11-09) |

M1-M6 are refusals from before this file existed, so their heads were published
after the fact. From the next new refusal on, the head hash is added here at the
time of the refusal -- before any export.

Case numbers M4 and M5 are reserved: M4 waits on a fix to entity-chain export, and M5
(a refused first entry) has no chain to export.
