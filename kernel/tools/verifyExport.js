#!/usr/bin/env node
"use strict";

/**
 * =====================================================
 * STANDALONE EXPORT VERIFIER
 * =====================================================
 *
 * Verifies an Invari chain export WITHOUT Invari: no database, no
 * network, no npm packages. Needs this file plus kernel/canonicalize.js,
 * kernel/seal.js, kernel/affirmationChain.js and kernel/gateCheck.js (all
 * dependency-free), and Invari's PUBLIC signing keys.
 *
 *   node verifyExport.js <export.json> [public-keys.json] [--require-signed <section>=<n> ...]
 *
 * --require-signed affirmationArtifacts=3: fail unless at least 3 records
 * in that section verified by signature (not legacy, not untagged) -- so a
 * case that is about signed records can't pass on an older export.
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
 *   6. signed records (R-153, export format 3.2.0): every record in an
 *      affirmationArtifacts or enforcementLog section. Sealed ones
 *      (sealFormatVersion 2, and 3 for affirmations) by their own hash and
 *      Ed25519 signature;
 *      older ones by their legacy unsigned formula, reported as legacy.
 *      A 3.1.0 export wrote these records untagged, so a sealed record
 *      there can't be recomputed -- reported as a note, not a failure.
 *   7. affirmations cited by a ledger entry (evidenceRefs) that are in
 *      this export must be AFFIRM records that verify
 *   8. T-88a (export format 3.3.0): affirmation chains. An export carries
 *      the WHOLE chain of every subject it cites; each must be numbered
 *      1..n with no gap, linked, one subject type, in time order, every
 *      RETRACT withdrawing an earlier AFFIRM (kernel/affirmationChain.js);
 *      and each cited affirmation must be its gate's latest record at the
 *      citing entry's eventTimestamp -- not withdrawn or superseded before
 *      the commit. Records of formats 1 and 2 are unchained (legacy).
 *   9. T-88b: an entry carrying gateReads (the kernel's in-commit gate read)
 *      agrees with its subject's chain in this export: the head it read is
 *      present with the same hash, each gate record is the one it read and
 *      the gate's latest up to that head, and evidenceRefs are exactly those
 *      records (kernel/gateCheck.js gateReadsProblems).
 *
 * Exit code 0 = all checks pass, 1 = a check failed, 2 = usage/input error.
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { verifyLedgerEntrySeal, computeHash, verifySignature, importPublicKey } = require(
  path.join(__dirname, "..", "seal"),
);
// T-44: entry format v5 -- the context anchors (kernel/entryFormat.js).
const { entryAnchorProblem } = require(path.join(__dirname, "..", "entryFormat"));
// T-88a: the affirmation chain rules, shared with the server.
const { verifyAffirmationChain, latestForGate, idOf, timeOf } = require(path.join(__dirname, "..", "affirmationChain"));
// T-88b: gate reads against the exported chain.
const { gateReadsProblems, gateExceptionProblems } = require(path.join(__dirname, "..", "gateCheck"));

// Signed record kinds (R-153): the export section they sit in, their seal
// domain, and the legacy (pre-seal, unsigned) formula. Written out here so
// this tool needs only canonicalize.js + seal.js's generic functions.
const SIGNED_RECORD_KINDS = {
  affirmationArtifacts: {
    label: "affirmation",
    domain: "invari.kos.affirmation.record.v1",
    sealedFormats: [2, 3], // 3 = chained (T-88a)
    // models/AffirmationArtifact.js computeLegacyEntryHash
    legacy: (r) =>
      [
        r.nodeRef,
        r.response,
        r.actor?.invariId,
        new Date(r.createdAt?.$date ?? r.createdAt).toISOString(),
        r.natureBundleHash,
        r.sessionContext ?? "",
      ].join("||"),
  },
  enforcementLog: {
    label: "refusal record",
    domain: "invari.kos.enforcement.record.v1",
    sealedFormats: [2],
    // models/EnforcementLog.js computeLegacyEntryHash
    legacy: (r) => {
      const actorId = r.actor?.actorId?.$oid ?? r.actor?.actorId;
      return [
        r.assetId ?? "",
        r.attemptedEventType ?? "",
        r.nNodeRef ?? "",
        r.outcome,
        r.reasonCode ?? "",
        actorId ? String(actorId) : "",
        new Date(r.createdAt?.$date ?? r.createdAt).toISOString(),
        r.natureBundleHash ?? "",
        r.previousAssetEntryHash ?? "",
        r.previousActorEntryHash ?? "",
      ].join("||");
    },
  },
};

const UNSEALED = new Set(["_id", "__v", "entryHash", "entrySignature"]);

function verifySignedRecord(kind, r, publicKeys) {
  if (kind.sealedFormats.includes(r.sealFormatVersion)) {
    const body = {};
    for (const [k, v] of Object.entries(r)) if (!UNSEALED.has(k)) body[k] = v;
    const expected = computeHash({ domain: kind.domain, body, acceptTaggedJSON: true });
    const pem = publicKeys?.[r.signingKeyId];
    const signatureOk = !!pem && verifySignature(r.entryHash, r.entrySignature, importPublicKey(pem, r.signingKeyId));
    return { format: r.sealFormatVersion, hashOk: expected === r.entryHash, signatureOk };
  }
  if (r.sealFormatVersion === undefined || r.sealFormatVersion === null) {
    return { format: 1, hashOk: sha256(kind.legacy(r)) === r.entryHash, signatureOk: null };
  }
  return { format: r.sealFormatVersion, hashOk: false, signatureOk: false };
}

// Is the export at least this format version (MAJOR.MINOR)?
function exportAtLeast(artifact, major, minor) {
  const v = String(artifact?.exportMetadata?.version || "0").split(".").map(Number);
  return v[0] > major || (v[0] === major && (v[1] || 0) >= minor);
}
// Did this export write its records tagged? (3.2.0 and later.)
const writesTaggedRecords = (artifact) => exportAtLeast(artifact, 3, 2);

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
    const anchorProblem = entryAnchorProblem(e);
    if (anchorProblem) problems.push(`${where}: ${anchorProblem}`);
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

  // (6) signed records, (7) affirmations cited by ledger entries
  const tagged = writesTaggedRecords(artifact);
  const signedSummary = [];
  const affirmationsById = new Map();
  for (const s of sections.records) {
    const key = s.path.split(".").pop();
    const kind = SIGNED_RECORD_KINDS[key];
    if (!kind) continue;
    const count = { sealed: 0, chained: 0, legacy: 0, unverifiable: 0 };
    for (const r of s.data) {
      const id = r?._id?.$oid ?? r?._id;
      const where = `${s.path} ${kind.label} ${id}`;
      if (key === "affirmationArtifacts") affirmationsById.set(String(id), r);
      if (kind.sealedFormats.includes(r?.sealFormatVersion) && !tagged) {
        count.unverifiable += 1;
        continue;
      }
      let v;
      try {
        v = verifySignedRecord(kind, r, publicKeys);
      } catch (err) {
        problems.push(`${where}: ${err.message}`);
        continue;
      }
      if (v.format !== 1 && !kind.sealedFormats.includes(v.format)) problems.push(`${where}: unknown sealFormatVersion ${v.format}`);
      else if (!v.hashOk) problems.push(`${where}: content does not match entryHash${v.format === 1 ? " (legacy formula)" : ""}`);
      else if (v.format !== 1 && !v.signatureOk) problems.push(`${where}: signature does not verify under key "${r.signingKeyId}"`);
      else if (v.format !== 1) {
        count.sealed += 1;
        if (v.format === 3) count.chained += 1;
      } else count.legacy += 1;
    }
    signedSummary.push({ section: s.path, kind: kind.label, ...count });
    notes.push(
      `${s.path}: ${count.sealed} signed ${kind.label}(s) verified` +
        (count.chained ? ` (${count.chained} chained)` : "") +
        `, ${count.legacy} legacy (unsigned, legacy formula)` +
        (count.unverifiable
          ? `, ${count.unverifiable} signed but written untagged by a ${artifact?.exportMetadata?.version} export -- section integrity only`
          : ""),
    );
  }
  if (affirmationsById.size > 0) {
    let cited = 0;
    for (const e of byHash.values()) {
      for (const ref of e.evidenceRefs || []) {
        const a = affirmationsById.get(String(ref?.$oid ?? ref));
        if (!a) continue;
        cited += 1;
        if (a.response !== "AFFIRM") {
          problems.push(`${e.assetId} v${e.version} cites affirmation ${ref?.$oid ?? ref}, which is a ${a.response}, not an AFFIRM`);
        }
      }
    }
    notes.push(`${cited} affirmation(s) cited by ledger entries in this export, each an AFFIRM`);
  }

  // (8) affirmation chains (T-88a)
  if (affirmationsById.size > 0) {
    const kind = SIGNED_RECORD_KINDS.affirmationArtifacts;
    const bySubject = new Map();
    for (const r of affirmationsById.values()) {
      const k = String(r.assetId);
      if (!bySubject.has(k)) bySubject.set(k, []);
      bySubject.get(k).push(r);
    }
    const verifyOne = (r) => {
      if (!tagged && kind.sealedFormats.includes(r?.sealFormatVersion)) return { valid: true, format: r.sealFormatVersion };
      try {
        const v = verifySignedRecord(kind, r, publicKeys);
        return { valid: v.hashOk && v.signatureOk !== false, format: v.format, reason: "does not verify" };
      } catch (err) {
        return { valid: false, format: r?.sealFormatVersion, reason: err.message };
      }
    };
    let chained = 0;
    let broken = 0;
    for (const [subject, records] of bySubject) {
      const c = verifyAffirmationChain(records, { verifyRecord: verifyOne });
      if (c.length > 0) chained += 1;
      if (c.problems.some((p) => p.code !== "RECORD_INVALID")) broken += 1;
      for (const p of c.problems) {
        if (p.code === "RECORD_INVALID") continue; // reported under (6)
        problems.push(`affirmation chain ${subject} ${p.at ?? ""}: ${p.code} -- ${p.detail}`);
      }
    }
    // Cited records must decide their gate at the citing entry's time. Only
    // exports from 3.3.0 carry every record of a cited subject; an older
    // export carries the cited records alone, so the check would say nothing.
    if (exportAtLeast(artifact, 3, 3)) {
      let inForce = 0;
      for (const e of byHash.values()) {
        const tau = e.eventTimestamp ?? e.createdAt;
        for (const ref of e.evidenceRefs || []) {
          const a = affirmationsById.get(String(ref?.$oid ?? ref));
          if (!a || a.response !== "AFFIRM" || !tau) continue;
          const decider = latestForGate(bySubject.get(String(a.assetId)) || [], { nodeRef: a.nodeRef, tau });
          const aid = String(a._id?.$oid ?? a._id);
          if (!decider || String(decider._id?.$oid ?? decider._id) !== aid) {
            problems.push(
              `${e.assetId} v${e.version} cites affirmation ${aid} (${a.nodeRef}), which was not the gate's latest record at the entry's eventTimestamp`,
            );
          } else inForce += 1;
        }
      }
      notes.push(
        `${chained} affirmation chain(s) checked, ${broken ? `${broken} BROKEN` : "all intact"}; ${inForce} cited affirmation(s) still in force at their commit`,
      );
    } else {
      notes.push(
        `${chained} affirmation chain(s) checked, ${broken ? `${broken} BROKEN` : "all intact"}; this ${artifact?.exportMetadata?.version} export carries cited records only, so "still in force at the commit" is not checked`,
      );
    }
  }

  // (9) gate reads (T-88b)
  for (const e of byHash.values()) {
    for (const p of gateExceptionProblems(e)) problems.push(`${e.assetId} v${e.version} ${p}`);
    if (e.gateException && !gateExceptionProblems(e).length) notes.push(`${e.assetId} v${e.version}: declared gate exception ${e.gateException.basis}`);
  }
  {
    const gated = [...byHash.values()].filter((e) => e.gateReads);
    if (gated.length > 0) {
      const bySubject = new Map();
      for (const r of affirmationsById.values()) {
        const k = String(r.assetId);
        if (!bySubject.has(k)) bySubject.set(k, []);
        bySubject.get(k).push(r);
      }
      let ok = 0;
      for (const e of gated) {
        const records = bySubject.get(String(e.gateReads.subjectId)) || [];
        const ps = records.length
          ? gateReadsProblems(e, records, { idOf, timeOf })
          : [`its gate subject ${e.gateReads.subjectId} has no affirmation records in this export`];
        for (const p of ps) problems.push(`${e.assetId} v${e.version} gateReads: ${p}`);
        if (!ps.length) ok += 1;
      }
      notes.push(`${ok} of ${gated.length} gated entr${gated.length === 1 ? "y" : "ies"}: gate reads match the exported affirmation chain`);
    }
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
    signedRecords: signedSummary,
    problems,
    notes,
  };
}

module.exports = { verifyExport };

if (require.main === module) {
  const args = process.argv.slice(2);
  const requireSigned = [];
  for (let i = args.indexOf("--require-signed"); i >= 0; i = args.indexOf("--require-signed")) {
    const [section, n] = String(args[i + 1] || "").split("=");
    if (!section || !Number.isInteger(Number(n))) {
      console.error("--require-signed takes <section>=<count>");
      process.exit(2);
    }
    requireSigned.push({ section, n: Number(n) });
    args.splice(i, 2);
  }
  const [exportPath, keysPath] = args;
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
  for (const { section, n } of requireSigned) {
    const got = result.signedRecords.find((x) => x.section === section)?.sealed ?? 0;
    if (got < n) {
      result.ok = false;
      result.problems.push(`${section}: ${got} record(s) verified by signature, at least ${n} required`);
    }
  }
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
