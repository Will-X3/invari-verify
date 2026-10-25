#!/usr/bin/env node
"use strict";

/**
 * =====================================================
 * STANDALONE REFUSAL-RECORD VERIFIER
 * =====================================================
 *
 * Checks one sealed EnforcementLog record WITHOUT Invari: no database, no
 * network, no npm packages. Needs kernel/canonicalize.js and kernel/seal.js
 * one folder up, plus Invari's PUBLISHED public keys.
 *
 *   node verifyRefusalRecord.js <record.json> <public-keys.json> [--previous-actor <record.json>]
 *
 *   record.json        the refusal record, tagged JSON ({"$oid"}, {"$date"})
 *   public-keys.json   {"<keyId>": "<PEM>"} as Invari published them
 *   --previous-actor   optional: the same actor's previous record, to check
 *                      the link between them
 *
 * Some refusals never reach the kernel: a licensee asks for an act the
 * workflow does not allow (receive a transfer that is already complete,
 * ship one that was never accepted ...). There is no proposal and so no
 * receipt. What exists is the refusal record, and unlike a receipt's
 * outcome, the WHOLE record is signed: outcome, reason code, message,
 * actor, attempt and both chain links.
 *
 * What it proves:
 *   1. the record's entryHash recomputes: SHA-256 over
 *      "invari.kos.enforcement.record.v1\n" + canonical JSON of every
 *      stored field except _id, entryHash and entrySignature
 *   2. entrySignature verifies under the published key named by
 *      signingKeyId -- Invari wrote exactly this refusal
 *   3. its chain positions are well-formed: sequence 1 has no previous
 *      hash, a later sequence has one
 *   4. (with --previous-actor) the previous record verifies too, is the
 *      same actor, is sequence n-1, and its entryHash is the
 *      previousActorEntryHash this record signed
 *
 * What it does NOT prove:
 *   - that every refusal was recorded. A complete record chain (each
 *     sequence linked to the one before, ending at a published checkpoint)
 *     is what makes a missing record visible.
 *   - whoever holds Invari's private key could sign a record that never
 *     happened. Same defence as chains: published checkpoints.
 *
 * Exit code 0 = all checks pass, 1 = a check failed, 2 = usage/input error.
 */

const fs = require("fs");
const path = require("path");
const { computeHash, verifySignature, importPublicKey } = require(path.join(__dirname, "..", "seal"));

// The seal domain of EnforcementLog records (sealFormatVersion 2).
const ENFORCEMENT_RECORD_DOMAIN = "invari.kos.enforcement.record.v1";
const ENFORCEMENT_SEAL_FORMAT = 2;
const UNSEALED = new Set(["_id", "entryHash", "entrySignature"]);

function readJson(file, what) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (err) {
    console.error(`Cannot read ${what} (${file}): ${err.message}`);
    process.exit(2);
  }
}

function sealBody(record) {
  const body = {};
  for (const [k, v] of Object.entries(record)) if (!UNSEALED.has(k)) body[k] = v;
  return body;
}

function oid(v) {
  return v && typeof v === "object" && typeof v.$oid === "string" ? v.$oid : v == null ? null : String(v);
}

function verifySeal(record, publicKeys) {
  if (record.sealFormatVersion !== ENFORCEMENT_SEAL_FORMAT) {
    return { ok: false, reason: `sealFormatVersion is ${record.sealFormatVersion}; this tool checks format ${ENFORCEMENT_SEAL_FORMAT}` };
  }
  let expected;
  try {
    expected = computeHash({ domain: ENFORCEMENT_RECORD_DOMAIN, body: sealBody(record), acceptTaggedJSON: true });
  } catch (err) {
    return { ok: false, reason: `cannot canonicalize the record: ${err.message}` };
  }
  const hashOk = expected === record.entryHash;
  const pem = publicKeys[record.signingKeyId];
  if (!pem) return { ok: false, hashOk, expected, reason: `no published key "${record.signingKeyId}"` };
  const signatureOk = verifySignature(record.entryHash, record.entrySignature, importPublicKey(pem, record.signingKeyId));
  return {
    ok: hashOk && signatureOk,
    hashOk,
    signatureOk,
    expected,
    reason: !hashOk
      ? "entryHash does not match the record's contents -- a field was altered after it was written"
      : !signatureOk
        ? `entrySignature does not verify under key "${record.signingKeyId}"`
        : null,
  };
}

function checkPositions(record) {
  const problems = [];
  for (const [seq, prev, name] of [
    ["assetSequenceNumber", "previousAssetEntryHash", "scope"],
    ["actorSequenceNumber", "previousActorEntryHash", "actor"],
  ]) {
    const n = record[seq];
    const p = record[prev] ?? null;
    if (n === undefined || n === null) continue;
    if (!Number.isInteger(n) || n < 1) problems.push(`${seq} ${n} is not a positive integer`);
    else if (n === 1 && p !== null) problems.push(`${name} chain: sequence 1 names a previous hash`);
    else if (n > 1 && !/^[0-9a-f]{64}$/.test(String(p))) problems.push(`${name} chain: sequence ${n} has no previous hash`);
  }
  return problems;
}

function main() {
  const args = process.argv.slice(2);
  const i = args.indexOf("--previous-actor");
  const prevFile = i >= 0 ? args[i + 1] : null;
  const positional = i >= 0 ? args.filter((_, j) => j !== i && j !== i + 1) : args;
  if (positional.length < 2 || (i >= 0 && !prevFile)) {
    console.error("usage: node verifyRefusalRecord.js <record.json> <public-keys.json> [--previous-actor <record.json>]");
    process.exit(2);
  }
  const record = readJson(positional[0], "record");
  const publicKeys = readJson(positional[1], "public keys");
  const failures = [];

  console.log("Refusal record");
  console.log(`  record       ${oid(record._id)}`);
  console.log(`  scope        ${record.assetId}   (sequence ${record.assetSequenceNumber})`);
  console.log(`  actor        ${record.actor?.actorInvariId} ${record.actor?.employmentRole ?? ""}   (sequence ${record.actorSequenceNumber})`);
  console.log(`  attempted    ${record.attemptedEventType}  ${JSON.stringify(record.attemptedMetadata ?? {})}`);
  console.log(`  at           ${record.createdAt?.$date ?? record.createdAt}`);
  console.log("");
  console.log("Signed content (covered by the signature)");
  console.log(`  phase        ${record.enforcementPhase}`);
  console.log(`  outcome      ${record.outcome}`);
  console.log(`  reason       ${record.reasonCode}`);
  console.log(`  message      ${record.message}`);
  console.log("");

  const seal = verifySeal(record, publicKeys);
  console.log(`[1] entryHash recomputes        ${seal.hashOk ? "OK" : "FAIL"}`);
  if (!seal.hashOk && seal.expected) console.log(`      expected ${seal.expected}\n      stored   ${record.entryHash}`);
  console.log(`${`[2] signature (${record.signingKeyId})`.padEnd(32)} ${seal.signatureOk ? "OK" : "FAIL"}`);
  if (!seal.ok) failures.push(seal.reason);

  const pos = checkPositions(record);
  console.log(`[3] chain positions             ${pos.length ? "FAIL" : "OK"}`);
  failures.push(...pos);

  if (prevFile) {
    const prev = readJson(prevFile, "previous actor record");
    const ps = verifySeal(prev, publicKeys);
    const linkProblems = [];
    if (!ps.ok) linkProblems.push(`previous record: ${ps.reason}`);
    if (oid(prev.actor?.actorId) !== oid(record.actor?.actorId)) linkProblems.push("previous record is a different actor");
    if (prev.actorSequenceNumber !== record.actorSequenceNumber - 1) {
      linkProblems.push(`previous record is actor sequence ${prev.actorSequenceNumber}, expected ${record.actorSequenceNumber - 1}`);
    }
    if (prev.entryHash !== record.previousActorEntryHash) linkProblems.push("previousActorEntryHash is not the previous record's entryHash");
    console.log(`[4] link to previous actor rec  ${linkProblems.length ? "FAIL" : "OK"}`);
    failures.push(...linkProblems);
  } else {
    console.log(`[4] link to previous actor rec  not checked (no --previous-actor record supplied)`);
  }

  console.log("");
  console.log("Not proven here: that every refusal was recorded, or that the key holder");
  console.log("did not sign a record that never happened. Published checkpoints are the defence.");
  console.log("");
  if (failures.length === 0) {
    console.log("RESULT: PASS -- a refusal signed by Invari, outcome and reason included");
    process.exit(0);
  }
  console.log("RESULT: FAIL");
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}

main();
