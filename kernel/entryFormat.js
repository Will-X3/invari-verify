"use strict";

/**
 * kernel/entryFormat.js -- T-44: ledger entry format (v5; v6 R-185; v7 T-62c-4a)
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
 * v7 (T-62c-4a, 2026-11-12) adds, inside entryHash:
 *   platformPolicyRef         { mode, version, platformHash } of the platform
 *                             policy the kernel evaluated the proposal
 *                             under: mode PACKAGE names the version of
 *                             package #0 in force and its platformHash;
 *                             mode CODE_PRE_PACKAGE (no version admitted
 *                             yet) has version and platformHash null. On
 *                             every v7 entry, so an auditor can tell, for
 *                             any entry, which platform rules it ran under.
 *
 * All are set by commitEntry from the receipt it finalizes, never by a
 * caller. This file has no dependencies so invari-verify carries the
 * same copy.
 */

const ENTRY_FORMAT_VERSION = 7;
const SUPPORTED_ENTRY_FORMATS = Object.freeze([4, 5, 6, 7]);
const PLATFORM_POLICY_MODES = Object.freeze(["PACKAGE", "CODE_PRE_PACKAGE"]);
const VERSION_RE = /^\d+\.\d+\.\d+$/;

/** R-185: why a natureBundleRef does not fit its natureBundleHash, or null. */
function natureRefProblem(ref, natureBundleHash) {
  const hash = natureBundleHash ?? null;
  if (hash === null)
    return ref === null || ref === undefined
      ? null
      : "natureBundleRef without a natureBundleHash";
  if (!ref || typeof ref !== "object")
    return "natureBundleHash without a natureBundleRef";
  if (typeof ref.bundleId !== "string" || !ref.bundleId)
    return "natureBundleRef.bundleId missing";
  if (typeof ref.version !== "string" || !VERSION_RE.test(ref.version))
    return "natureBundleRef.version missing or malformed";
  if (ref.hash !== hash)
    return "natureBundleRef.hash does not equal natureBundleHash";
  return null;
}
const HEX64 = /^[0-9a-f]{64}$/;

/** T-62c-4a: why a platformPolicyRef is not well formed, or null. */
function platformPolicyRefProblem(ref) {
  if (!ref || typeof ref !== "object") return "platformPolicyRef missing";
  const keys = Object.keys(ref).sort().join();
  if (keys !== "mode,platformHash,version")
    return "platformPolicyRef must be exactly { mode, version, platformHash }";
  if (!PLATFORM_POLICY_MODES.includes(ref.mode))
    return `platformPolicyRef.mode must be ${PLATFORM_POLICY_MODES.join(" or ")}`;
  if (ref.mode === "PACKAGE") {
    if (typeof ref.version !== "string" || !VERSION_RE.test(ref.version))
      return "platformPolicyRef.version missing or malformed";
    if (typeof ref.platformHash !== "string" || !HEX64.test(ref.platformHash))
      return "platformPolicyRef.platformHash missing or malformed";
  } else if (ref.version !== null || ref.platformHash !== null) {
    return "a CODE_PRE_PACKAGE platformPolicyRef has version and platformHash null";
  }
  return null;
}

/** A plain number from a stored value or an export's tagged JSON. */
function plainNumber(v) {
  if (v && typeof v === "object")
    v = v.$numberInt ?? v.$numberLong ?? v.$numberDouble ?? v;
  return typeof v === "string" && v.trim() !== "" ? Number(v) : v;
}

/** Milliseconds from a Date, an ISO string or an export's { $date }. */
function timeOf(v) {
  if (v && typeof v === "object" && !(v instanceof Date) && "$date" in v) {
    v = v.$date;
    if (v && typeof v === "object") v = v.$numberLong ?? v;
  }
  if (v === null || v === undefined || v === "") return NaN;
  const t =
    v instanceof Date
      ? v.getTime()
      : typeof v === "number"
        ? v
        : new Date(isFinite(v) ? Number(v) : v).getTime();
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
  if (!SUPPORTED_ENTRY_FORMATS.includes(fmt))
    return `unknown entryFormatVersion ${JSON.stringify(entry.entryFormatVersion)}`;
  if (fmt < 5) return null;
  if (
    typeof entry.contextBundleHash !== "string" ||
    !HEX64.test(entry.contextBundleHash)
  ) {
    return "v5 entry without a valid contextBundleHash";
  }
  if (!Number.isFinite(timeOf(entry.contextSnapshotTimestamp))) {
    return "v5 entry without a valid contextSnapshotTimestamp";
  }
  if (fmt >= 6) {
    if (!("natureBundleRef" in (entry || {})))
      return "v6 entry without natureBundleRef (null when no bundle governed)";
    const p = natureRefProblem(entry.natureBundleRef, entry.natureBundleHash);
    if (p) return `v6 entry: ${p}`;
  }
  if (fmt >= 7) {
    const p = platformPolicyRefProblem(entry.platformPolicyRef);
    if (p) return `v7 entry: ${p}`;
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
    throw new TypeError(
      "entryFormat: the receipt's canonicalInputBundle has no valid contextHash -- T-44",
    );
  }
  const t = timeOf(b.temporalAnchor);
  if (!Number.isFinite(t)) {
    throw new TypeError(
      "entryFormat: the receipt's canonicalInputBundle has no valid temporalAnchor -- T-44",
    );
  }
  // R-185: the bundle ref the receipt resolved (kernel/canonicalBundle.js).
  const ref = b.natureBundleRef ?? null;
  const refProblem = natureRefProblem(ref, b.natureBundleHash ?? null);
  if (refProblem) {
    throw new TypeError(
      `entryFormat: the receipt's canonicalInputBundle cannot anchor natureBundleRef (${refProblem}) -- R-185`,
    );
  }
  // T-62c-4a: the platform policy the kernel evaluated under.
  const pp = b.platformPolicyRef;
  const ppProblem = platformPolicyRefProblem(pp);
  if (ppProblem) {
    throw new TypeError(
      `entryFormat: the receipt's canonicalInputBundle cannot anchor platformPolicyRef (${ppProblem}) -- T-62c-4a`,
    );
  }
  return {
    entryFormatVersion: ENTRY_FORMAT_VERSION,
    contextBundleHash: b.contextHash,
    contextSnapshotTimestamp: new Date(t),
    natureBundleRef: ref
      ? { bundleId: ref.bundleId, version: ref.version, hash: ref.hash }
      : null,
    platformPolicyRef: {
      mode: pp.mode,
      version: pp.version,
      platformHash: pp.platformHash,
    },
  };
}

/**
 * With the receipt in hand: does the entry's anchor match its receipt's
 * bundle? Null when it does (or the entry is v4).
 */
function anchorMismatch(entry, bundle) {
  if (entryFormatOf(entry) < 5) return null;
  const b = bundle || {};
  if (entry.contextBundleHash !== b.contextHash)
    return "contextBundleHash does not match the receipt's contextHash";
  if (timeOf(entry.contextSnapshotTimestamp) !== timeOf(b.temporalAnchor)) {
    return "contextSnapshotTimestamp does not match the receipt's temporalAnchor";
  }
  if (entryFormatOf(entry) >= 6) {
    const e = entry.natureBundleRef ?? null;
    const r = b.natureBundleRef ?? null;
    const same =
      (e === null && r === null) ||
      (!!e &&
        !!r &&
        e.bundleId === r.bundleId &&
        e.version === r.version &&
        e.hash === r.hash);
    if (!same)
      return "natureBundleRef does not match the receipt's natureBundleRef";
  }
  if (entryFormatOf(entry) >= 7) {
    const e = entry.platformPolicyRef ?? null;
    const r = b.platformPolicyRef ?? null;
    const same =
      !!e &&
      !!r &&
      e.mode === r.mode &&
      e.version === r.version &&
      e.platformHash === r.platformHash;
    if (!same)
      return "platformPolicyRef does not match the receipt's platformPolicyRef";
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
  platformPolicyRefProblem,
  PLATFORM_POLICY_MODES,
  timeOf,
};
