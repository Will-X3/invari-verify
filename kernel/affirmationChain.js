"use strict";

/**
 * kernel/affirmationChain.js (T-88a, B-57) -- the affirmation chain rules.
 *
 * Since sealFormatVersion 3 every AffirmationArtifact is a link in its
 * subject's chain: the subject is the asset, or the onboarding submission,
 * the gate belongs to (assetId). Each record carries chainSequence (1, 2,
 * 3 ... per subject) and previousRecordHash (the entryHash of the record
 * before it; null on the first). A unique { assetId, chainSequence } index
 * lets only one record take each place. Because a gate's state is its
 * LATEST record (R-154), a record deleted from the middle or the end of a
 * chain could revive an AFFIRM that was withdrawn; the chain makes that
 * visible: a gap, a broken link, or a head that no longer matches.
 *
 * Dependency-free on purpose: the model, scripts/verifyAffirmations.js,
 * scripts/verifyChains.js and kernel/tools/verifyExport.js (which runs with
 * no packages, outside Invari) all apply these same rules. Each caller
 * injects how ONE record is verified (database form or tagged-JSON export).
 *
 * Records written before format 3 (formats 1 and 2) carry no chain fields.
 * They are reported as legacy and unchained, verified one by one, never
 * treated as part of the chain. The pre-pilot re-seed removes them.
 */

const SUBJECT_TYPES = Object.freeze(["ASSET", "ONBOARDING_SUBMISSION"]);
const SHA256_HEX = /^[0-9a-f]{64}$/;

// Values as stored (Date, ObjectId) or as exported ({ $date }, { $oid }).
const idOf = (v) => (v && typeof v === "object" && "$oid" in v ? String(v.$oid) : v == null ? null : String(v));
const timeOf = (v) => {
  let raw = v && typeof v === "object" && !(v instanceof Date) && "$date" in v ? v.$date : v;
  if (raw && typeof raw === "object" && !(raw instanceof Date)) raw = raw.$numberLong ?? raw; // { $date: { $numberLong } }
  if (raw === null || raw === undefined || raw === "") return NaN;
  const t = raw instanceof Date ? raw.getTime() : typeof raw === "number" ? raw : new Date(isFinite(raw) ? Number(raw) : raw).getTime();
  return Number.isFinite(t) ? t : NaN;
};

const isChained = (r) => r && r.chainSequence !== undefined && r.chainSequence !== null;

/**
 * Verify every record of ONE subject.
 *
 * @param {object[]} records      all records of the subject, any order
 * @param {object}   opts
 * @param {function} opts.verifyRecord  (record) -> { valid, format, reason }
 * @returns {{ ok, subject, length, legacy, head, problems: {at, code, detail}[] }}
 *   length = chained records; legacy = unchained (format 1 / 2) records;
 *   head = { chainSequence, entryHash } of the last link, or null.
 */
function verifyAffirmationChain(records, { verifyRecord }) {
  if (typeof verifyRecord !== "function") throw new TypeError("verifyAffirmationChain: verifyRecord is required");
  const problems = [];
  const add = (at, code, detail) => problems.push({ at, code, detail });

  const subjects = new Set(records.map((r) => String(r.assetId)));
  if (subjects.size > 1) add(null, "MIXED_SUBJECTS", `records of ${subjects.size} subjects were passed as one chain`);
  const subject = records.length ? String(records[0].assetId) : null;

  const legacy = records.filter((r) => !isChained(r));
  const chained = records.filter(isChained).sort((a, b) => a.chainSequence - b.chainSequence);

  for (const r of legacy) {
    const v = verifyRecord(r);
    if (!v.valid) add(idOf(r._id), "RECORD_INVALID", v.reason || "does not verify");
    if (v.format === 3) add(idOf(r._id), "CHAIN_FIELDS_MISSING", "a format 3 record without chainSequence");
  }

  let expectedSeq = 1;
  let previousHash = null;
  let previousTime = -Infinity;
  let subjectType = null;
  const byId = new Map();

  for (const r of chained) {
    const at = `#${r.chainSequence}`;
    const v = verifyRecord(r);
    if (!v.valid) add(at, "RECORD_INVALID", v.reason || "does not verify");
    else if (v.format !== 3) add(at, "CHAIN_FORMAT", `chain fields on a format ${v.format} record`);

    if (r.chainSequence !== expectedSeq) {
      add(at, "CHAIN_GAP", `expected chainSequence ${expectedSeq}, found ${r.chainSequence} -- a record is missing or out of place`);
      expectedSeq = r.chainSequence; // re-anchor so one gap is reported once
    }
    if ((r.previousRecordHash ?? null) !== previousHash) {
      add(at, "CHAIN_LINK", "previousRecordHash is not the prior record's entryHash");
    }
    if (r.previousRecordHash != null && !SHA256_HEX.test(String(r.previousRecordHash))) {
      add(at, "CHAIN_LINK", "previousRecordHash is not a SHA-256 hex digest");
    }

    const t = timeOf(r.createdAt);
    if (!(t >= previousTime)) add(at, "CHAIN_TIME", "createdAt is earlier than the record before it (INV-αA-7)");
    previousTime = t;

    if (!SUBJECT_TYPES.includes(r.subjectType)) add(at, "SUBJECT_TYPE", `subjectType ${JSON.stringify(r.subjectType)} is not one of ${SUBJECT_TYPES.join(", ")}`);
    else if (subjectType === null) subjectType = r.subjectType;
    else if (r.subjectType !== subjectType) add(at, "SUBJECT_TYPE", `subjectType changed from ${subjectType} to ${r.subjectType} inside one chain`);

    // A RETRACT withdraws an AFFIRM earlier in the same chain, for the same gate.
    if (r.response === "RETRACT") {
      const target = byId.get(idOf(r.supersedesArtifactId));
      if (!target) add(at, "RETRACT_TARGET", "its target is not an earlier record of this chain");
      else if (target.response !== "AFFIRM") add(at, "RETRACT_TARGET", `its target is a ${target.response}, not an AFFIRM`);
      else if (target.nodeRef !== r.nodeRef) add(at, "RETRACT_TARGET", `its target is gate ${target.nodeRef}, not ${r.nodeRef}`);
    }

    byId.set(idOf(r._id), r);
    previousHash = r.entryHash ?? null;
    expectedSeq += 1;
  }

  const last = chained[chained.length - 1];
  return {
    ok: problems.length === 0,
    subject,
    length: chained.length,
    legacy: legacy.length,
    head: last ? { chainSequence: last.chainSequence, entryHash: last.entryHash } : null,
    problems,
  };
}

/**
 * The record that decides a gate at time tau: the latest record for
 * (subject, nodeRef) created at or before tau -- chained records by
 * chainSequence, legacy ones (always older) by createdAt then _id.
 * Pure; used to check that a commit cited an affirmation still in force.
 */
function latestForGate(records, { nodeRef, tau }) {
  const t = timeOf(tau);
  if (Number.isNaN(t)) throw new TypeError("latestForGate: tau is required");
  const eligible = records.filter((r) => r.nodeRef === nodeRef && timeOf(r.createdAt) <= t);
  eligible.sort((a, b) => {
    const ca = isChained(a) ? a.chainSequence : -1;
    const cb = isChained(b) ? b.chainSequence : -1;
    if (ca !== cb) return cb - ca;
    const ta = timeOf(a.createdAt);
    const tb = timeOf(b.createdAt);
    if (ta !== tb) return tb - ta;
    return String(idOf(b._id)).localeCompare(String(idOf(a._id)));
  });
  return eligible[0] ?? null;
}

module.exports = { SUBJECT_TYPES, verifyAffirmationChain, latestForGate, isChained, idOf, timeOf };
