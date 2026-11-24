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
| V2 | `entity::6afa1a9d2e98d85fe889ddf3` | v8 (entry format 7, the export's own record) | `aa9535794803455f100b3f8afc3a2306e0af113c1c7fa4c87653dbf53e262158` | -- (accepted act; onboarding 2026-11-15) | After the export, with the evidence (2026-11-15) |

M1-M6 are refusals from before this file existed, so their heads were published
after the fact. From the next new refusal on, the head hash is added here at the
time of the refusal -- before any export.

Case numbers M4 and M5 are reserved: M4 waits on a fix to entity-chain export, and M5
(a refused first entry) has no chain to export.

## Platform chain

Invari's own chain (production, invari_v5): its genesis -- the declaration of the admission
rules, the signing key and the first governor -- and each version of the platform's own
package (package #0) admitted on it. A later export of the platform chain must contain
these entries unchanged. Published 2026-11-16; rows are only ever added.

| Chain | Version | Entry | entryHash | Committed (UTC) |
|-------|---------|-------|-----------|-----------------|
| `entity::6af9fe44012241e79c3718bf` | v1 | Platform genesis (Entity_Onboarded) | `c27818dee5fdb6707655851949b0f10dcfc7dc68c8c6a62bdecb25cd5394c553` | 2026-11-15 18:47:32 |
| `entity::6af9fe44012241e79c3718bf` | v2 | package #0 1.0.0 admitted (platformHash `eb651845dde7...`) | `274e56e973c33396339f980d71c9d7ee89c25ffb982c8cd48c390a3701d0e123` | 2026-11-15 18:47:33 |
| `entity::6af9fe44012241e79c3718bf` | v3 | package #0 1.1.0 admitted (platformHash `0a6a2031fb7b...`) | `0dd058a965862952e9d47a09661a1b68c88d7b7f7ebb0eefb97c2b419cea4858` | 2026-11-15 19:40:57 |
| `entity::6af9fe44012241e79c3718bf` | v4 | package #0 1.2.0 admitted (platformHash `ca718be23bd2...`) | `41b51f214334679541861e410d51cb9808989d8e1f911b89f012bb5fc14269ab` | 2026-11-15 20:05:23 |
| `entity::6af9fe44012241e79c3718bf` | v5 | package #0 1.3.0 admitted (platformHash `9b805e98c5f9...`) | `2d86b20a2d0d45bf6e719145ae4d19a17688d391abe3dfaeab3cc5a04fb21995` | 2026-11-16 21:11:39 |
| `entity::6af9fe44012241e79c3718bf` | v6 | package #0 1.4.0 admitted (platformHash `a991cabd5c4e...`) | `9b5b86a8080088f4c0ff447fa154816c66588162468a7f55ccf735a13c5e5df9` | 2026-11-16 21:52:21 |
| `entity::6af9fe44012241e79c3718bf` | v7 | package #0 1.5.0 admitted (platformHash `29e4f5279684...`) | `514d3910518ce17b4de5eba2a60d187512b20376bc192a1e4dd3001a92460c79` | 2026-11-16 22:43:15 |
| `entity::6af9fe44012241e79c3718bf` | v8 | package #0 1.6.0 admitted (platformHash `abce4f67b80b...`) | `e3e2416a5e43349d05526b1f73abea67d0710474b6f9c196b8ee6c88ef69075c` | 2026-11-17 02:50:38 |
| `entity::6af9fe44012241e79c3718bf` | v9 | package #0 1.7.0 admitted (platformHash `90ec02d0529b...`) | `18d89e681cbc29f849ad1d08dd8bffe5672bd019ba575ed7eae1839b679a02e6` | 2026-11-17 21:18:53 |
| `entity::6af9fe44012241e79c3718bf` | v10 | package #0 1.8.0 admitted (platformHash `9ff78f14df24...`) | `5828258b178512162c74a9dde66d76a057ae089ce63ff277d4bba8082df222bc` | 2026-11-17 21:45:14 |
| `entity::6af9fe44012241e79c3718bf` | v11 | package #0 1.9.0 admitted (platformHash `9c76ef71aaa7...`) | `1cb2ea64bce2cd68bbf48e88d62c04af7376bbfc6bc677a4cf01c305271464e4` | 2026-11-17 22:00:33 |
| `entity::6af9fe44012241e79c3718bf` | v12 | package #0 1.10.0 admitted (platformHash `72068657c0a1...`) | `1b6f1ecb6ee4c2bf5f23c3410bd1759f02fd0b2ecfe08b218bd3f17d4d8c1349` | 2026-11-17 22:19:33 |
| `entity::6af9fe44012241e79c3718bf` | v13 | package #0 1.11.0 admitted (platformHash `b47cb3c38f8c...`) | `97e1609e83c2f70d19c50626fd3eec1ca9fe48759e6c1a06586c2f7c1ab86af0` | 2026-11-17 22:57:45 |
| `entity::6af9fe44012241e79c3718bf` | v14 | package #0 1.12.0 admitted (platformHash `256d6966a54c...`) | `a9571050939ff2890d72d74be44207c858c3cb98d6d592abe2131debfca8be8f` | 2026-11-18 22:48:54 |
| `entity::6af9fe44012241e79c3718bf` | v15 | package #0 1.13.0 admitted (platformHash `b21be1d1a16d...`) | `cc72b06ae5bf4c869328373eb67c1a984f475e7130d729016a3bff9adc7279a8` | 2026-11-21 23:03:51 |
| `entity::6af9fe44012241e79c3718bf` | v16 | package #0 1.14.0 admitted (platformHash `dcdc82c02248...`) | `8215fbff5b35dc03dac2f6d9a9076b716a9f887c2ec18f988f12619608799fa0` | 2026-11-21 23:57:46 |
| `entity::6af9fe44012241e79c3718bf` | v17 | package #0 1.15.0 admitted (platformHash `4f4dd3eb9de2...`) | `f20d4198a9f20e6cc83cf8af4c43adbf1ed8544cb52c3af161e239332269f2ef` | 2026-11-22 00:33:58 |
| `entity::6af9fe44012241e79c3718bf` | v18 | package #0 1.16.0 admitted (platformHash `fdc3fa0806e3...`) | `53c11c02c4b78388132ef1e974cf0905e7c3afbc70e5cb124cf5f901d0d1ae3e` | 2026-11-22 01:06:35 |
| `entity::6af9fe44012241e79c3718bf` | v19 | package #0 1.17.0 admitted (platformHash `43b95e085d3e...`) | `9781ab595ac8902f5bda4d6ce7973c8264ed720c9db2963dcbe5d5222f1bd444` | 2026-11-22 01:21:05 |
| `entity::6af9fe44012241e79c3718bf` | v20 | package #0 1.18.0 admitted (platformHash `509a8924d109...`) | `c1daac59e1be7bf04d598d5476d74d2dbf0419513d9f693ae8d626c194050998` | 2026-11-22 03:53:35 |
| `entity::6af9fe44012241e79c3718bf` | v21 | package #0 1.19.0 admitted (platformHash `3500ec4b23f3...`) | `dc1828cd6f9c51b4b28d28a4ffeeb85b2d645beaf54de7af998683a313ee5acb` | 2026-11-22 04:34:02 |
| `entity::6af9fe44012241e79c3718bf` | v22 | package #0 1.20.0 admitted | `4b5b44ad5f46480fe2bc1cd00474c460b5a20ec009c1d8d995440d1dd815fab1` | 2026-11-22 22:31:25 |
| `entity::6af9fe44012241e79c3718bf` | v23 | package #0 1.21.0 admitted (platformHash `52cc7adb...`) | `bc46e5145cdd7cc8a074d23177234d06d1f0188d59c7bd3a03b89239ddb925b3` | 2026-11-23 21:41:52 |
| `entity::6af9fe44012241e79c3718bf` | v24 | package #0 1.22.0 admitted (platformHash `3d416e27dc61...`) | `f1285e7e2376bed3538cd1321bab3d801315d9cd442f50a37db54592d65d7659` | 2026-11-23 22:00:32 |
| `entity::6af9fe44012241e79c3718bf` | v25 | package #0 1.23.0 admitted (platformHash `27f7ff3463bf...`) | `0afda8eeb9175cedd9ada7b275f820fe86184c0e8a00adc979f6f08d7c10a966` | 2026-11-23 22:34:32 |
| `entity::6af9fe44012241e79c3718bf` | v26 | package #0 1.24.0 admitted (platformHash `6a030ec8a998...`) | `400315d226a3c159cdff86b1e8099bae90ca35c76a515b19f26343f038712fec` | 2026-11-24 02:15:21 |

## .Glyph files

The three descriptions the kernel judges by -- the shared ISA (the vocabulary of
events, subjects and states), the frame ABI (the 160-byte frame layout) and the
conditions grammar (the closed list of kinds a condition may take). Each is identified
by the SHA-256 of its own canonical JSON and names the version before it, so each forms
a chain. The files are in [glyph/](glyph/); `node verify-glyph.js` recomputes every hash
and checks each chain against these rows. A failover kernel must hold exactly these
versions before it can become authoritative. Published 2026-11-17; rows are only ever added.

| File | Version | Hash | Previous | Published |
|------|---------|------|----------|-----------|
| `invari.shared-isa` | 1.0.0 | `cbc14faac275ec260ea199caaeb78f217ea94ce6868ce2e4b947c6729af614e8` | -- (first) | 2026-11-17 |
| `invari.shared-isa` | 1.1.0 | `9298ff13e7d39d696732f48f2c86553cae1fb7a7f48425e99412367e1e6fe134` | 1.0.0 | 2026-11-17 |
| `invari.frame-abi` | 2 | `040e57edc575d035cfccdcb184fc286c3b9d5d8dc62cb43986585f2057df7953` | 1 (never published as a file) | 2026-11-17 |
| `invari.glyph-grammar` | 1.0.0 | `8cce1c232675187e64b8fbf9f7e18d63af77829b60f811e26217cbd89f24ec36` | -- (first) | 2026-11-17 |
| `invari.glyph-grammar` | 1.1.0 | `4fd6cfa8edfe2e0305b869dc19c767e794ab95236824256ab1d44872444858ff` | 1.0.0 | 2026-11-17 |
| `invari.glyph-grammar` | 1.2.0 | `3446cb9bba7962ad40b12bf2707cd3509adc70492dc15391630e2372fec36e5a` | 1.1.0 | 2026-11-21 |
| `invari.glyph-grammar` | 1.3.0 | `7a290b0f0236d58aaa916cf3787eb82c38b7c0dda53a60503779a1da6c73c2cd` | 1.2.0 | 2026-11-21 |
| `invari.glyph-grammar` | 1.4.0 | `02edcd1039d1cc29312b2ee11316b7f28f759852cd9b5ff68615ff3ab84e319a` | 1.3.0 | 2026-11-21 |
| `invari.glyph-grammar` | 1.5.0 | `599996ba086f6e9771ddc73eafb1db4df265e89d4821ca55591cfdcc51827ae9` | 1.4.0 | 2026-11-21 |
| `invari.glyph-grammar` | 1.6.0 | `d699b29b3609c70a207fe0e58300e522befebce1e7465339ffa0e31bd07cb979` | 1.5.0 | 2026-11-21 |
| `invari.glyph-grammar` | 1.7.0 | `cd80cd38f713bd7e3876e4ce51b4b2a37a83d813df53fb89737929adf62c92bb` | 1.6.0 | 2026-11-23 |
| `invari.glyph-grammar` | 1.8.0 | `3b464ee76aec29c5c8307de9da8865b8cea119ea539850b6e3da78c3a2ef673a` | 1.7.0 | 2026-11-23 |
| `invari.glyph-grammar` | 1.9.0 | `30be16966fdf39b42a26b554edd42ace9a3aa775474778aab56ada09e7523db8` | 1.8.0 | 2026-11-23 |
