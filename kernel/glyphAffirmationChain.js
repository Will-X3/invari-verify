"use strict";

/**
 * kernel/glyphAffirmationChain.js (T-88c) -- the Glyph affirmation chain
 * rules.
 *
 * A Glyph affirmation is a person's AFFIRM / DENY / RETRACT of a whole
 * declaration version: today a Capability package version, later an
 * Authority version, a promotion, a demotion, an amendment (Glyph sec. 10).
 * Records are chained per bundle (subject.bundleId): every signature on
 * every version of one package -- the architect's interim one now,
 * counsel's and each business's later -- sits in one verifiable line, so
 * a withdrawn signature cannot quietly disappear.
 *
 * Rules, for the records of one bundle:
 *   - numbered 1..n with no gap; each previousRecordHash is the prior
 *     record's entryHash (null on the first);
 *   - all name the same subject.bundleId; tau never decreases;
 *   - a RETRACT withdraws an earlier AFFIRM in the same chain, of the
 *     same version, by the same signer.
 *
 * Dependency-free (verifyExport and outside verifiers use it too); each
 * caller injects how one record is verified.
 */

const SHA256_HEX = /^[0-9a-f]{64}$/;
const idOf = (v) => (v && typeof v === "object" && "$oid" in v ? String(v.$oid) : v == null ? null : String(v));
const timeOf = (v) => {
  let raw = v && typeof v === "object" && !(v instanceof Date) && "$date" in v ? v.$date : v;
  if (raw && typeof raw === "object" && !(raw instanceof Date)) raw = raw.$numberLong ?? raw;
  if (raw === null || raw === undefined || raw === "") return NaN;
  const t = raw instanceof Date ? raw.getTime() : typeof raw === "number" ? raw : new Date(isFinite(raw) ? Number(raw) : raw).getTime();
  return Number.isFinite(t) ? t : NaN;
};

function verifyGlyphChain(records, { verifyRecord }) {
  if (typeof verifyRecord !== "function") throw new TypeError("verifyGlyphChain: verifyRecord is required");
  const problems = [];
  const add = (at, code, detail) => problems.push({ at, code, detail });
  const bundles = new Set(records.map((r) => r.subject?.bundleId));
  if (bundles.size > 1) add(null, "MIXED_SUBJECTS", `records of ${bundles.size} bundles were passed as one chain`);

  const sorted = [...records].sort((a, b) => a.chainSequence - b.chainSequence);
  let expected = 1;
  let prevHash = null;
  let prevTau = -Infinity;
  const byId = new Map();
  for (const r of sorted) {
    const at = `#${r.chainSequence}`;
    const v = verifyRecord(r);
    if (!v.valid) add(at, "RECORD_INVALID", v.reason || "does not verify");
    if (r.chainSequence !== expected) {
      add(at, "CHAIN_GAP", `expected chainSequence ${expected}, found ${r.chainSequence}`);
      expected = r.chainSequence;
    }
    if ((r.previousRecordHash ?? null) !== prevHash) add(at, "CHAIN_LINK", "previousRecordHash is not the prior record's entryHash");
    if (r.previousRecordHash != null && !SHA256_HEX.test(String(r.previousRecordHash))) add(at, "CHAIN_LINK", "previousRecordHash is not a SHA-256 digest");
    const t = timeOf(r.tau);
    if (!(t >= prevTau)) add(at, "CHAIN_TIME", "tau is earlier than the record before it");
    prevTau = t;
    if (r.response === "RETRACT") {
      const target = byId.get(idOf(r.supersedesRecordId));
      if (!target) add(at, "RETRACT_TARGET", "its target is not an earlier record of this chain");
      else if (target.response !== "AFFIRM") add(at, "RETRACT_TARGET", `its target is a ${target.response}`);
      else if (target.subject?.version !== r.subject?.version) add(at, "RETRACT_TARGET", "its target is another version");
      else if (target.signer?.invariId !== r.signer?.invariId) add(at, "RETRACT_TARGET", "only the signer may withdraw their own affirmation");
    }
    byId.set(idOf(r._id), r);
    prevHash = r.entryHash ?? null;
    expected += 1;
  }
  const last = sorted[sorted.length - 1];
  return {
    ok: problems.length === 0,
    bundleId: sorted[0]?.subject?.bundleId ?? null,
    length: sorted.length,
    head: last ? { chainSequence: last.chainSequence, entryHash: last.entryHash } : null,
    problems,
  };
}

/**
 * The signatures standing on one version at tau: for each signer, their
 * latest AFFIRM / DENY on that version, unless a later RETRACT withdrew it.
 * Pure. (Admission -- T-51 / stage 4 -- reads this.)
 */
function standingSignatures(records, { version, tau }) {
  const t = timeOf(tau);
  if (Number.isNaN(t)) throw new TypeError("standingSignatures: tau is required");
  const seen = [...records]
    .filter((r) => r.subject?.version === version && timeOf(r.tau) <= t)
    .sort((a, b) => a.chainSequence - b.chainSequence);
  const withdrawn = new Set(seen.filter((r) => r.response === "RETRACT").map((r) => idOf(r.supersedesRecordId)));
  const bySigner = new Map();
  for (const r of seen) {
    if (r.response === "RETRACT") continue;
    bySigner.set(r.signer?.invariId, r);
  }
  return [...bySigner.values()].filter((r) => !withdrawn.has(idOf(r._id)));
}

module.exports = { verifyGlyphChain, standingSignatures, idOf, timeOf };
