#!/usr/bin/env node
"use strict";

/**
 * =====================================================
 * STANDALONE EXPORT VERIFIER
 * =====================================================
 *
 * Verifies an Invari chain export WITHOUT Invari: no database, no
 * network, no npm packages. Needs this file plus kernel/canonicalize.js
 * and kernel/seal.js (both dependency-free), and Invari's PUBLIC
 * signing keys.
 *
 *   node verifyExport.js <export.json> [public-keys.json]
 *
 * public-keys.json: {"<keyId>": "<PEM>"} from Invari's published keys,
 * NOT from the export itself. If omitted, the keys embedded in the
 * export are used and the result says so: a forger could embed their
 * own keys, so that mode only proves internal consistency.
 *
 * Works from the artifact's actual structure, so it handles every
 * export type (entity, asset, employee, customer, platform asset):
 *
 *   1. finds every ledger section, wherever nested: an object with an
 *      `entries` array of ledger entries and a `rootHash`
 *   2. each entry: entryHash recomputes from its own content, and its
 *      Ed25519 signature verifies under signingKeyId (once per entry,
 *      even if it appears in several sections)
 *   3. each chain (entries grouped by assetId): versions contiguous and
 *      every previousEntryHash links. A chain that starts after v1 --
 *      e.g. the export's own audit record on the platform ledger -- is
 *      reported as a partial chain, not an error: its first link points
 *      outside the export
 *   4. each section's rootHash: SHA-256 of its entries' entryHash values
 *      concatenated in listed order; record sections: SHA-256 of
 *      JSON.stringify(records | assets)
 *   5. masterRootHash: matches one of the formulas the export
 *      controllers use (see masterCandidates)
 *
 * Exit code 0 = all checks pass, 1 = a check failed, 2 = usage/input error.
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { verifyLedgerEntrySeal } = require(path.join(__dirname, "..", "seal"));

const sha256 = (s) => crypto.createHash("sha256").update(s).digest("hex");

const isLedgerEntry = (e) =>
  e &&
  typeof e === "object" &&
  typeof e.entryHash === "string" &&
  typeof e.assetId === "string" &&
  typeof e.version === "number";

/** Walk the artifact; collect ledger sections and record sections with their paths. */
function collectSections(node, pathLabel, out) {
  if (!node || typeof node !== "object") return out;
  if (Array.isArray(node)) return out;
  if (typeof node.rootHash === "string") {
    if (Array.isArray(node.entries) && node.entries.every(isLedgerEntry)) {
      out.ledger.push({
        path: pathLabel,
        rootHash: node.rootHash,
        entries: node.entries,
      });
    } else if (Array.isArray(node.records)) {
      out.records.push({
        path: pathLabel,
        rootHash: node.rootHash,
        data: node.records,
      });
    } else if (Array.isArray(node.assets)) {
      out.records.push({
        path: pathLabel,
        rootHash: node.rootHash,
        data: node.assets,
      });
    }
  }
  for (const [k, v] of Object.entries(node)) {
    if (
      k === "exportMetadata" ||
      k === "entries" ||
      k === "records" ||
      k === "assets"
    )
      continue;
    if (v && typeof v === "object" && !Array.isArray(v))
      collectSections(v, pathLabel ? `${pathLabel}.${k}` : k, out);
  }
  return out;
}

// The master-root formulas the export controllers use today:
//   - single-section exports: masterRootHash IS that section's rootHash
//   - multi-section exports: SHA-256 of the section rootHashes
//     concatenated in document order
//   - platform asset export: SHA-256(chain + transferRecords + enforcementLog)
function masterCandidates(artifact, sections) {
  const all = [...sections.ledger, ...sections.records];
  const cands = [];
  if (all.length === 1)
    cands.push({ formula: "single section rootHash", value: all[0].rootHash });
  cands.push({
    formula: "SHA-256(section roots, document order)",
    value: sha256(all.map((s) => s.rootHash).join("")),
  });
  const chainRoot = artifact?.exportMetadata?.chain?.rootHash;
  if (chainRoot) {
    cands.push({
      formula: "SHA-256(chain + transferRecords + enforcementLog)",
      value: sha256(
        [
          chainRoot,
          artifact.transferRecords?.rootHash,
          artifact.enforcementLog?.rootHash,
        ]
          .filter(Boolean)
          .join(""),
      ),
    });
  }
  return cands;
}

function verifyExport(artifact, publicKeys) {
  const problems = [];
  const notes = [];
  const sections = collectSections(artifact, "", { ledger: [], records: [] });

  if (sections.ledger.length === 0)
    problems.push("export contains no ledger sections");

  // (4) section roots
  for (const s of sections.ledger) {
    if (sha256(s.entries.map((e) => e.entryHash).join("")) !== s.rootHash) {
      problems.push(`${s.path}: rootHash does not match its entries`);
    }
  }
  for (const s of sections.records) {
    if (sha256(JSON.stringify(s.data)) !== s.rootHash)
      problems.push(`${s.path}: rootHash does not match its records`);
  }

  // (2) every distinct entry, once
  const byHash = new Map();
  for (const s of sections.ledger)
    for (const e of s.entries)
      if (!byHash.has(e.entryHash)) byHash.set(e.entryHash, e);
  for (const e of byHash.values()) {
    const where = `${e.assetId} v${e.version}`;
    try {
      const r = verifyLedgerEntrySeal(e, {
        publicKeys,
        acceptTaggedJSON: true,
      });
      if (!r.hashOk)
        problems.push(`${where}: content does not match entryHash`);
      if (!r.signatureOk)
        problems.push(
          `${where}: signature does not verify under key "${e.signingKeyId}"`,
        );
    } catch (err) {
      problems.push(`${where}: ${err.message}`);
    }
  }

  // (3) chains
  const chains = new Map();
  for (const e of byHash.values()) {
    if (!chains.has(e.assetId)) chains.set(e.assetId, []);
    chains.get(e.assetId).push(e);
  }
  const chainSummary = [];
  for (const [assetId, es] of chains) {
    es.sort((a, b) => a.version - b.version);
    const first = es[0].version;
    es.forEach((e, i) => {
      if (e.version !== first + i)
        problems.push(
          `${assetId}: expected v${first + i}, found v${e.version}`,
        );
      if (i === 0) {
        if (first === 1 && (e.previousEntryHash ?? null) !== null)
          problems.push(
            `${assetId} v1: genesis must have previousEntryHash null`,
          );
      } else if ((e.previousEntryHash ?? null) !== es[i - 1].entryHash) {
        problems.push(
          `${assetId} v${e.version}: previousEntryHash does not link to v${e.version - 1}`,
        );
      }
    });
    const partial = first > 1;
    if (partial)
      notes.push(
        `${assetId}: partial chain v${first}-v${es[es.length - 1].version} (its link to v${first - 1} is outside this export)`,
      );
    chainSummary.push({
      assetId,
      from: first,
      to: es[es.length - 1].version,
      entries: es.length,
      partial,
    });
  }

  // (5) master root
  const master = artifact?.exportMetadata?.masterRootHash;
  if (master) {
    const hit = masterCandidates(artifact, sections).find(
      (c) => c.value === master,
    );
    if (hit) notes.push(`masterRootHash verified (${hit.formula})`);
    else
      problems.push(
        "masterRootHash does not match any known formula over the sections in this file",
      );
  } else {
    notes.push("no masterRootHash in exportMetadata");
  }

  return {
    ok: problems.length === 0,
    entryCount: byHash.size,
    chains: chainSummary,
    problems,
    notes,
  };
}

module.exports = { verifyExport };

if (require.main === module) {
  const [exportPath, keysPath] = process.argv.slice(2);
  if (!exportPath) {
    console.error(
      "Usage: node verifyExport.js <export.json> [public-keys.json]",
    );
    process.exit(2);
  }
  let artifact, publicKeys, independent;
  try {
    artifact = JSON.parse(fs.readFileSync(exportPath, "utf8"));
    if (keysPath) {
      publicKeys = JSON.parse(fs.readFileSync(keysPath, "utf8"));
      independent = true;
    } else {
      publicKeys = artifact?.exportMetadata?.verification?.signingKeys || {};
      independent = false;
    }
  } catch (err) {
    console.error(`Could not read input: ${err.message}`);
    process.exit(2);
  }

  const result = verifyExport(artifact, publicKeys);
  console.log(`Entries checked: ${result.entryCount}`);
  for (const c of result.chains) {
    console.log(
      `Chain ${c.assetId}: v${c.from}-v${c.to} (${c.entries} entries)${c.partial ? " [partial]" : ""}`,
    );
  }
  for (const n of result.notes) console.log(`Note: ${n}`);
  if (!independent) {
    console.log(
      "WARNING: using public keys embedded in the export. This proves internal",
    );
    console.log(
      "consistency only; pass Invari's published keys to verify authenticity.",
    );
  }
  if (result.ok) {
    console.log("RESULT: PASS");
    process.exit(0);
  }
  console.log("RESULT: FAIL");
  for (const p of result.problems) console.log(`  - ${p}`);
  process.exit(1);
}
