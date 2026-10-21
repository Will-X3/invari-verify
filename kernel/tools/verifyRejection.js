#!/usr/bin/env node
"use strict";

/**
 * =====================================================
 * STANDALONE REJECTION VERIFIER
 * =====================================================
 *
 * Checks a refused proposal WITHOUT Invari: no database, no network, no
 * npm packages. Needs this file, verifyExport.js beside it, and
 * kernel/canonicalize.js + kernel/seal.js one folder up -- the same
 * layout as the repository -- plus Invari's PUBLISHED public keys.
 *
 *   node verifyRejection.js <asset-export.json> <receipt.json> <public-keys.json> [--expect-head <entryHash>]
 *
 *   asset-export.json  Invari's asset chain export (tagged JSON)
 *   receipt.json       the rejection receipt (scripts/exportReceiptEvidence.js)
 *   public-keys.json   {"<keyId>": "<PEM>"} as Invari published them --
 *                      NOT the copy embedded in the export
 *   --expect-head      the chain-head entryHash published when the refusal
 *                      happened (a checkpoint the reader saw before this export)
 *
 * What it proves:
 *   1. the chain: every entry's hash recomputes, every signature verifies
 *      under the published key, versions run from v1 with every link intact
 *      (verifyExport)
 *   2. the receipt's input commitment: SHA-256 over
 *      "invari.kos.receipt.input.v4\n" + canonical {tenantId, bundle}
 *      recomputes, and its Ed25519 signature verifies under the published
 *      key -- Invari's kernel issued a receipt for exactly this proposal
 *   3. the proposal was for this asset and was formed against version
 *      stateVersion of this chain, by the tenant that held it then
 *   4. no entry on the chain was written from this receipt
 *   5. the head the proposal was formed against is still on the chain,
 *      unchanged, and (with --expect-head) equals the published checkpoint;
 *      any later entries are listed, each with its own receipt
 *
 * Stale proposals (STALE_VERSION): the signed bundle carries the version the
 * proposer CLAIMED (stateVersion) and the head the kernel actually evaluated
 * against (stateHash). For a stale proposal the two differ by design -- that
 * difference is the evidence. It is accepted only if stateHash is the entryHash
 * of a LATER version on this chain, and the signed temporalAnchor falls at or
 * after that entry and before the next one (so it really was the head at the
 * moment of refusal). The tenant, nothing-written and --expect-head checks then
 * run against that head. Anything else is still a failure.
 *
 * What it does NOT prove (stated in the output, not hidden):
 *   - the outcome (evaluationOutcome, failureReasonCode) is written when the
 *     receipt is finalized and is NOT covered by the signature (R-95). This
 *     tool shows it, marked unsigned. Points 2-5 are what make it credible:
 *     a signed proposal against the head, and no entry written from it.
 *   - whoever holds Invari's private key could re-sign a rewritten chain.
 *     --expect-head against a checkpoint published earlier is the defence.
 *
 * Exit code 0 = all checks pass, 1 = a check failed, 2 = usage/input error.
 */

const fs = require("fs");
const path = require("path");
const { verifyReceiptInputCommit } = require(
  path.join(__dirname, "..", "seal"),
);
const { verifyExport } = require(path.join(__dirname, "verifyExport"));

// An id in tagged JSON ({"$oid": "..."}) or as a plain string.
const idOf = (v) =>
  v && typeof v === "object" && typeof v.$oid === "string"
    ? v.$oid
    : v == null
      ? null
      : String(v);

function collectEntries(node, out = []) {
  if (!node || typeof node !== "object") return out;
  if (Array.isArray(node)) {
    for (const x of node) collectEntries(x, out);
    return out;
  }
  if (
    typeof node.entryHash === "string" &&
    typeof node.assetId === "string" &&
    typeof node.version === "number"
  ) {
    out.push(node);
    return out;
  }
  for (const [k, v] of Object.entries(node))
    if (k !== "exportMetadata") collectEntries(v, out);
  return out;
}

function verifyRejection(
  artifact,
  receipt,
  publicKeys,
  { expectHead = null } = {},
) {
  const problems = [];
  const notes = [];
  const facts = {};

  // 1. chain
  const chainResult = verifyExport(artifact, publicKeys);
  for (const p of chainResult.problems) problems.push(`chain: ${p}`);
  for (const n of chainResult.notes) notes.push(`chain: ${n}`);

  // 2. receipt input commitment
  try {
    const r = verifyReceiptInputCommit(receipt, {
      publicKeys,
      acceptTaggedJSON: true,
    });
    if (r.reason === "UNSIGNED")
      problems.push("receipt: no signature or signingKeyId");
    else {
      if (!r.hashOk)
        problems.push(
          "receipt: inputCommitHash does not recompute from {tenantId, canonicalInputBundle}",
        );
      if (!r.signatureOk)
        problems.push(
          `receipt: inputCommitSignature does not verify under key "${receipt.signingKeyId}"`,
        );
    }
  } catch (err) {
    problems.push(`receipt: ${err.message}`);
  }

  // 3. binding to this chain
  const bundle = receipt.canonicalInputBundle || {};
  const assetId = bundle.assetId;
  const stateVersion = bundle.stateVersion;
  facts.receiptId = receipt.receiptId;
  facts.assetId = assetId;
  facts.eventType = bundle.eventType ?? null;
  facts.stateVersion = stateVersion;

  if (typeof assetId !== "string")
    problems.push("receipt: bundle has no assetId");
  if (typeof stateVersion !== "number")
    problems.push(
      "receipt: bundle has no numeric stateVersion (not a ledger proposal)",
    );

  const byHash = new Map();
  for (const e of collectEntries(artifact))
    if (!byHash.has(e.entryHash)) byHash.set(e.entryHash, e);
  const chain = [...byHash.values()]
    .filter((e) => e.assetId === assetId)
    .sort((a, b) => a.version - b.version);

  if (typeof assetId === "string" && chain.length === 0)
    problems.push(`export holds no chain for asset ${assetId}`);
  if (chain.length && chain[0].version !== 1)
    problems.push(
      `export's chain for ${assetId} starts at v${chain[0].version}, not v1`,
    );

  const head = chain[chain.length - 1] || null;
  facts.currentHead = head
    ? { version: head.version, entryHash: head.entryHash }
    : null;

  let base = null; // the head the proposal was formed against
  if (typeof stateVersion === "number" && chain.length) {
    if (stateVersion === 0) {
      problems.push(
        "receipt: stateVersion 0 -- proposed against an empty chain, which this export shows was not empty; nothing to compare",
      );
    } else {
      base = chain.find((e) => e.version === stateVersion) || null;
      if (!base)
        problems.push(
          `receipt: proposed against v${stateVersion}, which is not on the exported chain`,
        );
    }
  }
  facts.proposedAgainst = base
    ? { version: base.version, entryHash: base.entryHash }
    : null;

  // The entry the kernel actually evaluated against. Normally the proposal's
  // own base; for a stale proposal, the later head named by the signed stateHash.
  let evaluated = base;

  // The signed bundle names the head it was formed against (stateHash):
  // the receipt itself is a checkpoint, signed when the proposal was made.
  if (base && bundle.stateHash !== undefined) {
    if (bundle.stateHash !== base.entryHash) {
      const observed = chain.find((e) => e.entryHash === bundle.stateHash) || null;
      if (observed && observed.version > base.version) {
        // Stale-proposal path: prove `observed` was the head when the
        // proposal was refused, using only signed values.
        const tOf = (v) => {
          const d = v && typeof v === "object" ? v.$date : v;
          const t = d ? Date.parse(d) : NaN;
          return Number.isNaN(t) ? null : t;
        };
        const anchor = tOf(bundle.temporalAnchor);
        const atHead = tOf(observed.eventTimestamp);
        const next = chain.find((e) => e.version === observed.version + 1) || null;
        const atNext = next ? tOf(next.eventTimestamp) : null;
        if (anchor === null || atHead === null || (next && atNext === null)) {
          problems.push(
            `receipt: stale-version check needs the signed temporalAnchor and entry timestamps; one is missing`,
          );
        } else if (anchor < atHead || (next && anchor >= atNext)) {
          problems.push(
            `receipt: signed stateHash is v${observed.version}'s entryHash, but the signed temporalAnchor ${new Date(anchor).toISOString()} is not between v${observed.version} (${new Date(atHead).toISOString()})` +
              (next ? ` and v${next.version} (${new Date(atNext).toISOString()})` : "") +
              ` -- it was not the head when this proposal was evaluated`,
          );
        } else {
          evaluated = observed;
          facts.stale = { claimed: base.version, headAtRefusal: observed.version };
          notes.push(
            `STALE PROPOSAL: the signed bundle claims v${base.version} but signs v${observed.version}'s entryHash -- the head when it was evaluated ` +
              `(signed temporalAnchor ${new Date(anchor).toISOString()} is after v${observed.version}` +
              (next ? ` and before v${next.version}` : ", the current head") +
              `). A proposal formed against a superseded version is what this receipt records.`,
          );
        }
      } else {
        problems.push(
          `receipt: signed stateHash ${bundle.stateHash} is not v${base.version}'s entryHash ${base.entryHash}` +
            (observed ? ` (it is v${observed.version}'s, an EARLIER version)` : ""),
        );
      }
    } else
      notes.push(
        `receipt signs the head it was proposed against: stateHash = v${base.version} entryHash`,
      );
  } else if (base) {
    notes.push(
      "receipt bundle has no stateHash: bound to the head by version only",
    );
  }

  if (evaluated) {
    const t = idOf(receipt.tenantNamespace?.tenantId);
    const holder = idOf(evaluated.tenantContext?.tenantId);
    if (!t || t !== holder) {
      problems.push(
        `receipt: tenant ${t} is not the tenant on v${evaluated.version} (${holder})`,
      );
    }
  }

  // 4. nothing written from this receipt
  const written = chain.filter((e) => e.receiptId === receipt.receiptId);
  for (const e of written)
    problems.push(
      `v${e.version} was written from this receipt -- the proposal was NOT refused`,
    );

  // 5. the head
  if (evaluated && head) {
    const later = chain.filter((e) => e.version > evaluated.version);
    if (later.length === 0) {
      notes.push(
        `head unchanged since the proposal: v${evaluated.version} ${evaluated.entryHash}`,
      );
    } else {
      notes.push(
        `chain moved on after the proposal: ${later.map((e) => `v${e.version} ${e.eventType} (receipt ${e.receiptId})`).join("; ")} -- none from this receipt`,
      );
    }
  }
  if (expectHead) {
    if (!evaluated)
      problems.push(
        "--expect-head given, but the proposal's base entry could not be found",
      );
    else if (evaluated.entryHash !== expectHead) {
      problems.push(
        `checkpoint: v${evaluated.version} is ${evaluated.entryHash}, not the published ${expectHead}`,
      );
    } else
      notes.push(
        `checkpoint: v${evaluated.version} matches the published head hash`,
      );
  } else {
    notes.push(
      "no --expect-head: the head was checked against this export only, not against a checkpoint published earlier",
    );
  }

  return {
    ok: problems.length === 0,
    facts,
    outcome: {
      evaluationOutcome: receipt.evaluationOutcome ?? null,
      failureReasonCode: receipt.failureReasonCode ?? null,
      validationPhaseReached: receipt.validationPhaseReached ?? null,
      signed: false,
    },
    chains: chainResult.chains,
    problems,
    notes,
  };
}

module.exports = { verifyRejection };

if (require.main === module) {
  const args = process.argv.slice(2);
  let expectHead = null;
  const i = args.indexOf("--expect-head");
  if (i !== -1) {
    expectHead = args[i + 1] || null;
    args.splice(i, 2);
  }
  const [exportPath, receiptPath, keysPath] = args;
  if (!exportPath || !receiptPath || !keysPath || (i !== -1 && !expectHead)) {
    console.error(
      "Usage: node verifyRejection.js <asset-export.json> <receipt.json> <public-keys.json> [--expect-head <entryHash>]",
    );
    process.exit(2);
  }
  let artifact, receipt, publicKeys;
  try {
    artifact = JSON.parse(fs.readFileSync(exportPath, "utf8"));
    receipt = JSON.parse(fs.readFileSync(receiptPath, "utf8"));
    publicKeys = JSON.parse(fs.readFileSync(keysPath, "utf8"));
  } catch (err) {
    console.error(`Could not read input: ${err.message}`);
    process.exit(2);
  }

  const r = verifyRejection(artifact, receipt, publicKeys, { expectHead });
  const f = r.facts;
  console.log(
    `Receipt ${f.receiptId}: ${f.eventType} on ${f.assetId}, proposed against v${f.stateVersion}`,
  );
  for (const c of r.chains)
    console.log(
      `Chain ${c.assetId}: v${c.from}-v${c.to} (${c.entries} entries)${c.partial ? " [partial]" : ""}`,
    );
  if (f.currentHead)
    console.log(
      `Current head: v${f.currentHead.version} ${f.currentHead.entryHash}`,
    );
  for (const n of r.notes) console.log(`Note: ${n}`);
  console.log(
    `Outcome (NOT SIGNED -- written at finalization, outside the signature): ${r.outcome.evaluationOutcome}` +
      (r.outcome.failureReasonCode ? ` -- ${r.outcome.failureReasonCode}` : ""),
  );
  if (r.ok) {
    console.log(
      f.stale
        ? `RESULT: PASS -- stale proposal: claimed v${f.stale.claimed}, refused at head v${f.stale.headAtRefusal}; intact chain; nothing written from it`
        : "RESULT: PASS -- signed proposal against an intact chain; nothing written from it",
    );
    process.exit(0);
  }
  console.log("RESULT: FAIL");
  for (const p of r.problems) console.log(`  - ${p}`);
  process.exit(1);
}
