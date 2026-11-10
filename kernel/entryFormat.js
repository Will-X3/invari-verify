"use strict";

/**
 * kernel/entryFormat.js -- T-44: ledger entry format v5
 *
 * Two separate versions, on purpose:
 *   hashChainFormatVersion  HOW an entry is sealed (seal.js: canonical
 *                           serializer, SHA-256 over the whole stored
 *                           document minus _id / entryHash /
 *                           entrySignature, Ed25519). Still 4: the seal
 *                           covers every field, so new fields need no
 *                           new seal.
 *   entryFormatVersion      WHAT an entry must carry. 5 adds the context
 *                           anchors below; an entry without the field is
 *                           v4 (everything written before T-44) and
 *                           verifies as before.
 *
 * The context anchors (v5), inside entryHash:
 *   contextBundleHash         SHA-256 of the static context the proposal
 *                             was evaluated in -- the receipt bundle's
 *                             contextHash (domain + fulfillment mode,
 *                             kernel/canonicalBundle.js). Live context is
 *                             not pinned on any commit path today (since
 *                             T-66 a policy cannot read it); when it is,
 *                             it joins this hash.
 *   contextSnapshotTimestamp  tau: the instant the context was pinned --
 *                             the receipt bundle's temporalAnchor, which
 *                             both write paths also use as eventTimestamp.
 *
 * v6 (R-185, 2026-11-10) adds, inside entryHash:
 *   natureBundleRef           { bundleId, version, hash } of the certified
 *                             bundle that governed the entry -- hash equal
 *                             to the entry's natureBundleHash -- or null
 *                             when natureBundleHash is null. Replay names
 *                             the bundle without searching the store.
 *
 * All are set by commitEntry from the receipt it finalizes, never by a
 * caller. This file has no dependencies so invari-verify carries the
 * same copy.
 */

const ENTRY_FORMAT_VERSION = 6;
const SUPPORTED_ENTRY_FORMATS = Object.freeze([4, 5, 6]);
const VERSION_RE = /^\d+\.\d+\.\d+$/;

/** R-185: why a natureBundleRef does not fit its natureBundleHash, or null. */
function natureRefProblem(ref, natureBundleHash) {
  const hash = natureBundleHash ?? null;
  if (hash === null) return ref === null || ref === undefined ? null : "natureBundleRef without a natureBundleHash";
  if (!ref || typeof ref !== "object") return "natureBundleHash without a natureBundleRef";
  if (typeof ref.bundleId !== "string" || !ref.bundleId) return "natureBundleRef.bundleId missing";
  if (typeof ref.version !== "string" || !VERSION_RE.test(ref.version)) return "natureBundleRef.version missing or malformed";
  if (ref.hash !== hash) return "natureBundleRef.hash does not equal natureBundleHash";
  return null;
}
const HEX64 = /^[0-9a-f]{64}$/;

/** A plain number from a stored value or an export's tagged JSON. */
function plainNumber(v) {
  if (v && typeof v === "object") v = v.$numberInt ?? v.$numberLong ?? v.$numberDouble ?? v;
  return typeof v === "string" && v.trim() !== "" ? Number(v) : v;
}

/** Milliseconds from a Date, an ISO string or an export's { $date }. */
function timeOf(v) {
  if (v && typeof v === "object" && !(v instanceof Date) && "$date" in v) {
    v = v.$date;
    if (v && typeof v === "object") v = v.$numberLong ?? v;
  }
  if (v === null || v === undefined || v === "") return NaN;
  const t = v instanceof Date ? v.getTime() : typeof v === "number" ? v : new Date(isFinite(v) ? Number(v) : v).getTime();
  return Number.isFinite(t) ? t : NaN;
}

/** The entry's format version; an entry without the field is v4. */
function entryFormatOf(entry) {
  const v = plainNumber(entry?.entryFormatVersion);
  return v === undefined || v === null ? 4 : v;
}

/**
 * Why this entry does not meet its own format, or null.
 * v4: nothing to check. v5: both anchors present and well-formed.
 */
function entryAnchorProblem(entry) {
  const fmt = entryFormatOf(entry);
  if (!SUPPORTED_ENTRY_FORMATS.includes(fmt)) return `unknown entryFormatVersion ${JSON.stringify(entry.entryFormatVersion)}`;
  if (fmt < 5) return null;
  if (typeof entry.contextBundleHash !== "string" || !HEX64.test(entry.contextBundleHash)) {
    return "v5 entry without a valid contextBundleHash";
  }
  if (!Number.isFinite(timeOf(entry.contextSnapshotTimestamp))) {
    return "v5 entry without a valid contextSnapshotTimestamp";
  }
  if (fmt >= 6) {
    if (!("natureBundleRef" in (entry || {}))) return "v6 entry without natureBundleRef (null when no bundle governed)";
    const p = natureRefProblem(entry.natureBundleRef, entry.natureBundleHash);
    if (p) return `v6 entry: ${p}`;
  }
  return null;
}

/**
 * The anchors commitEntry seals, from the receipt bundle it finalizes.
 * Throws if the bundle cannot supply them: no entry is written unanchored.
 */
function anchorsFromBundle(bundle) {
  const b = bundle || {};
  if (typeof b.contextHash !== "string" || !HEX64.test(b.contextHash)) {
    throw new TypeError("entryFormat: the receipt's canonicalInputBundle has no valid contextHash -- T-44");
  }
  const t = timeOf(b.temporalAnchor);
  if (!Number.isFinite(t)) {
    throw new TypeError("entryFormat: the receipt's canonicalInputBundle has no valid temporalAnchor -- T-44");
  }
  // R-185: the bundle ref the receipt resolved (kernel/canonicalBundle.js).
  const ref = b.natureBundleRef ?? null;
  const refProblem = natureRefProblem(ref, b.natureBundleHash ?? null);
  if (refProblem) {
    throw new TypeError(`entryFormat: the receipt's canonicalInputBundle cannot anchor natureBundleRef (${refProblem}) -- R-185`);
  }
  return {
    entryFormatVersion: ENTRY_FORMAT_VERSION,
    contextBundleHash: b.contextHash,
    contextSnapshotTimestamp: new Date(t),
    natureBundleRef: ref ? { bundleId: ref.bundleId, version: ref.version, hash: ref.hash } : null,
  };
}

/**
 * With the receipt in hand: does the entry's anchor match its receipt's
 * bundle? Null when it does (or the entry is v4).
 */
function anchorMismatch(entry, bundle) {
  if (entryFormatOf(entry) < 5) return null;
  const b = bundle || {};
  if (entry.contextBundleHash !== b.contextHash) return "contextBundleHash does not match the receipt's contextHash";
  if (timeOf(entry.contextSnapshotTimestamp) !== timeOf(b.temporalAnchor)) {
    return "contextSnapshotTimestamp does not match the receipt's temporalAnchor";
  }
  if (entryFormatOf(entry) >= 6) {
    const e = entry.natureBundleRef ?? null;
    const r = b.natureBundleRef ?? null;
    const same = (e === null && r === null) || (!!e && !!r && e.bundleId === r.bundleId && e.version === r.version && e.hash === r.hash);
    if (!same) return "natureBundleRef does not match the receipt's natureBundleRef";
  }
  return null;
}

module.exports = {
  ENTRY_FORMAT_VERSION,
  SUPPORTED_ENTRY_FORMATS,
  entryFormatOf,
  entryAnchorProblem,
  anchorsFromBundle,
  anchorMismatch,
  natureRefProblem,
  timeOf,
};
