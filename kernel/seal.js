"use strict";

/**
 * =====================================================
 * KERNEL SEAL -- public hash + Ed25519 signature
 * =====================================================
 *
 * Every sealed record carries two things:
 *
 *   hash       SHA-256 over "<domain>\n<canonical body>". Anyone can
 *              recompute it: it proves the content is what the chain
 *              says it is.
 *   signature  Ed25519 signature by Invari over that hash. Anyone with
 *              Invari's PUBLIC key can verify it; only the PRIVATE key
 *              can produce one. It proves Invari's kernel committed
 *              this exact content.
 *
 * Why not HMAC (the first v4 draft): an HMAC can only be checked by
 * someone holding the secret key, so a regulator or partner receiving
 * an export could verify ordering but not content -- contradicting
 * "no Invari infrastructure required to verify". With signatures,
 * verification needs only the published public key.
 *
 * What this still does not solve: whoever holds the private key can
 * sign anything. Publishing periodic signed chain-head checkpoints
 * somewhere the key holder can't rewrite is the next layer.
 *
 * Domain separation: the domain tag is inside the hashed message, so a
 * ledger-entry signature can never be passed off as a receipt signature.
 *
 * KEYS (environment):
 *   KOS_SIGNING_KEYS           JSON {"<keyId>": "<base64 PKCS#8 DER Ed25519 private key>"}
 *   KOS_SIGNING_ACTIVE_KEY_ID  keyId used for new signatures
 *   KOS_VERIFY_KEYS            optional JSON {"<keyId>": "<base64 SPKI DER public key>"}
 *                              for retired keys whose private half is destroyed
 * Generate with: node kernel/tools/generateSigningKey.js <keyId>
 *
 * Fails closed: missing, malformed, or non-Ed25519 keys throw at load.
 * Call initKeyring() at boot.
 */

const crypto = require("crypto");
const { canonicalize } = require("./canonicalize");

const SEAL_DOMAINS = Object.freeze({
  LEDGER_ENTRY: "invari.kos.ledger.entry.v4",
  RECEIPT_INPUT: "invari.kos.receipt.input.v4",
  // R-76 (Part 59): a refusal record (EnforcementLog). Its own domain, so
  // a refusal's signature can never be passed off as a ledger entry's.
  ENFORCEMENT_RECORD: "invari.kos.enforcement.record.v1",
  // R-153: an affirmation (AffirmationArtifact) -- a human's AFFIRM / DENY
  // at an INTERPRETIVE gate, or its RETRACT. Its own domain, so an
  // affirmation's signature can never pass for a refusal's or an entry's.
  AFFIRMATION_RECORD: "invari.kos.affirmation.record.v1",
});

// Persisted as hashChainFormatVersion. v4 = canonical serializer,
// SHA-256 over the full persisted document (minus _id / entryHash /
// entrySignature), Ed25519 signature over that hash, sealed at commit.
const SEAL_FORMAT_VERSION = 4;

class KeyringError extends Error {
  constructor(message) {
    super(message);
    this.name = "KeyringError";
  }
}

// -----------------------------------------------------
// Keyring
// -----------------------------------------------------

function parseKeyMap(raw, name) {
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new KeyringError(`${name} is not valid JSON: ${err.message}`);
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new KeyringError(`${name} must be a JSON object of keyId -> base64 key`);
  }
  return parsed;
}

function loadKeyring(env = process.env) {
  const rawSigning = env.KOS_SIGNING_KEYS;
  const activeKeyId = env.KOS_SIGNING_ACTIVE_KEY_ID;

  if (!rawSigning || !activeKeyId) {
    throw new KeyringError(
      "KOS_SIGNING_KEYS and KOS_SIGNING_ACTIVE_KEY_ID must both be set; " +
        "the kernel will not seal ledger entries without a signing key. " +
        "Generate one with: node kernel/tools/generateSigningKey.js <keyId>",
    );
  }

  const privateKeys = new Map();
  const publicKeys = new Map();

  for (const [keyId, b64] of Object.entries(parseKeyMap(rawSigning, "KOS_SIGNING_KEYS"))) {
    let key;
    try {
      key = crypto.createPrivateKey({ key: Buffer.from(String(b64), "base64"), format: "der", type: "pkcs8" });
    } catch (err) {
      throw new KeyringError(`Signing key "${keyId}" is not a valid PKCS#8 DER key: ${err.message}`);
    }
    if (key.asymmetricKeyType !== "ed25519") {
      throw new KeyringError(`Signing key "${keyId}" is ${key.asymmetricKeyType}, expected ed25519`);
    }
    privateKeys.set(keyId, key);
    publicKeys.set(keyId, crypto.createPublicKey(key));
  }

  if (env.KOS_VERIFY_KEYS) {
    for (const [keyId, b64] of Object.entries(parseKeyMap(env.KOS_VERIFY_KEYS, "KOS_VERIFY_KEYS"))) {
      if (publicKeys.has(keyId)) {
        throw new KeyringError(`Key "${keyId}" appears in both KOS_SIGNING_KEYS and KOS_VERIFY_KEYS`);
      }
      publicKeys.set(keyId, importPublicKey(b64, keyId));
    }
  }

  if (!privateKeys.has(activeKeyId)) {
    throw new KeyringError(
      `KOS_SIGNING_ACTIVE_KEY_ID "${activeKeyId}" is not present in KOS_SIGNING_KEYS`,
    );
  }

  return Object.freeze({ activeKeyId, privateKeys, publicKeys });
}

function importPublicKey(b64OrPem, keyId = "?") {
  let key;
  try {
    const s = String(b64OrPem);
    key = s.includes("BEGIN PUBLIC KEY")
      ? crypto.createPublicKey(s)
      : crypto.createPublicKey({ key: Buffer.from(s, "base64"), format: "der", type: "spki" });
  } catch (err) {
    throw new KeyringError(`Public key "${keyId}" is not a valid SPKI key: ${err.message}`);
  }
  if (key.asymmetricKeyType !== "ed25519") {
    throw new KeyringError(`Public key "${keyId}" is ${key.asymmetricKeyType}, expected ed25519`);
  }
  return key;
}

let keyring = null;

function initKeyring(env = process.env) {
  keyring = loadKeyring(env);
  return keyring.activeKeyId;
}

function getKeyring() {
  if (!keyring) keyring = loadKeyring();
  return keyring;
}

function activeKeyId() {
  return getKeyring().activeKeyId;
}

// Public keys as PEM, for publishing and for embedding in exports.
function exportPublicKeys() {
  const out = {};
  for (const [keyId, key] of getKeyring().publicKeys) {
    out[keyId] = key.export({ format: "pem", type: "spki" }).toString();
  }
  return out;
}

// -----------------------------------------------------
// Hash + sign / verify (usable without a keyring: pass a public key)
// -----------------------------------------------------

function computeHash({ domain, body, acceptTaggedJSON = false }) {
  if (!domain) throw new KeyringError("Seal domain is required");
  return crypto
    .createHash("sha256")
    .update(`${domain}\n${canonicalize(body, { acceptTaggedJSON })}`, "utf8")
    .digest("hex");
}

function sign(hashHex, keyId) {
  const key = getKeyring().privateKeys.get(keyId);
  if (!key) throw new KeyringError(`No private key for keyId "${keyId}"`);
  return crypto.sign(null, Buffer.from(hashHex, "hex"), key).toString("base64");
}

function verifySignature(hashHex, signatureB64, publicKey) {
  if (typeof hashHex !== "string" || typeof signatureB64 !== "string") return false;
  try {
    return crypto.verify(null, Buffer.from(hashHex, "hex"), publicKey, Buffer.from(signatureB64, "base64"));
  } catch {
    return false;
  }
}

function publicKeyFor(keyId, publicKeys = null) {
  if (publicKeys) {
    const k = publicKeys[keyId];
    if (!k) throw new KeyringError(`Unknown signing keyId "${keyId}"`);
    return typeof k === "string" ? importPublicKey(k, keyId) : k;
  }
  const key = getKeyring().publicKeys.get(keyId);
  if (!key) throw new KeyringError(`Unknown signing keyId "${keyId}"`);
  return key;
}

// -----------------------------------------------------
// Ledger entries
// -----------------------------------------------------
// Sealed body = the exact object handed to the driver, minus the fields
// that can't be part of their own seal. Everything else -- version,
// previousEntryHash, epoch, tenantContext, isFinalAfterDisposition,
// receiptId, signingKeyId, the whole trace -- is covered, and new schema
// fields are covered automatically.
const LEDGER_UNSEALED_FIELDS = new Set(["_id", "__v", "entryHash", "entrySignature"]);

function ledgerSealBody(entry) {
  const body = {};
  for (const [k, v] of Object.entries(entry)) {
    if (!LEDGER_UNSEALED_FIELDS.has(k)) body[k] = v;
  }
  return body;
}

function hashLedgerEntry(entry, { acceptTaggedJSON = false } = {}) {
  return computeHash({ domain: SEAL_DOMAINS.LEDGER_ENTRY, body: ledgerSealBody(entry), acceptTaggedJSON });
}

// Returns { entryHash, entrySignature } for an entry that already
// carries signingKeyId.
function sealLedgerEntry(entry) {
  if (!entry.signingKeyId) throw new KeyringError("Ledger entry is missing signingKeyId");
  const entryHash = hashLedgerEntry(entry);
  return { entryHash, entrySignature: sign(entryHash, entry.signingKeyId) };
}

/**
 * Verify a stored entry (raw/lean) or an exported one (tagged JSON).
 * @param {object} entry
 * @param {object} [opts]
 * @param {object} [opts.publicKeys]  {keyId: PEM|base64 SPKI|KeyObject}. When given,
 *                                    no keyring is needed -- this is how a third
 *                                    party verifies.
 * @param {boolean} [opts.acceptTaggedJSON]  true for entries parsed from an export
 */
function verifyLedgerEntrySeal(entry, { publicKeys = null, acceptTaggedJSON = false } = {}) {
  const expected = hashLedgerEntry(entry, { acceptTaggedJSON });
  const hashOk = expected === entry.entryHash;
  const signatureOk = verifySignature(entry.entryHash, entry.entrySignature, publicKeyFor(entry.signingKeyId, publicKeys));
  return { ok: hashOk && signatureOk, hashOk, signatureOk, expected, actual: entry.entryHash };
}

// -----------------------------------------------------
// Refusal records (EnforcementLog) -- R-76, Part 59
// -----------------------------------------------------
// Same rule as ledger entries: the sealed body is the whole stored
// record minus the fields that can't be part of their own seal. Before
// Part 59 the record's hash covered ten fixed fields; the message, the
// policy trace, the attempt and the actor's role could change without
// breaking it. Now every field is covered, including any added later.
// Records written before Part 59 have no sealFormatVersion and keep
// verifying under the old formula (models/EnforcementLog.js).
const ENFORCEMENT_UNSEALED_FIELDS = new Set(["_id", "__v", "entryHash", "entrySignature"]);

function enforcementSealBody(record) {
  const body = {};
  for (const [k, v] of Object.entries(record)) {
    if (!ENFORCEMENT_UNSEALED_FIELDS.has(k)) body[k] = v;
  }
  return body;
}

function hashEnforcementRecord(record, { acceptTaggedJSON = false } = {}) {
  return computeHash({
    domain: SEAL_DOMAINS.ENFORCEMENT_RECORD,
    body: enforcementSealBody(record),
    acceptTaggedJSON,
  });
}

// Returns { entryHash, entrySignature } for a record that already
// carries signingKeyId. `record` must be plain data in the form it will
// be read back in (see EnforcementLog.buildSealed).
function sealEnforcementRecord(record) {
  if (!record.signingKeyId) throw new KeyringError("Enforcement record is missing signingKeyId");
  const entryHash = hashEnforcementRecord(record);
  return { entryHash, entrySignature: sign(entryHash, record.signingKeyId) };
}

function verifyEnforcementRecordSeal(record, { publicKeys = null, acceptTaggedJSON = false } = {}) {
  const expected = hashEnforcementRecord(record, { acceptTaggedJSON });
  const hashOk = expected === record.entryHash;
  let signatureOk = false;
  try {
    signatureOk = verifySignature(
      record.entryHash,
      record.entrySignature,
      publicKeyFor(record.signingKeyId, publicKeys),
    );
  } catch {
    signatureOk = false; // unknown key id: not verified
  }
  return { ok: hashOk && signatureOk, hashOk, signatureOk, expected, actual: record.entryHash };
}

// -----------------------------------------------------
// Affirmations (AffirmationArtifact) -- R-153
// -----------------------------------------------------
// Same rule again: the whole stored record minus the fields that can't be
// part of their own seal. Before R-153 an affirmation's hash covered six
// fields (nodeRef, response, actor invariId, createdAt, natureBundleHash,
// sessionContext), unsigned: the prompt, evidence, the order / 4473 /
// NICS links, the actor's role and a retraction's target could change
// without breaking it. Records with no sealFormatVersion keep verifying
// under that formula (models/AffirmationArtifact.js).
const AFFIRMATION_UNSEALED_FIELDS = new Set(["_id", "__v", "entryHash", "entrySignature"]);

function affirmationSealBody(record) {
  const body = {};
  for (const [k, v] of Object.entries(record)) {
    if (!AFFIRMATION_UNSEALED_FIELDS.has(k)) body[k] = v;
  }
  return body;
}

function hashAffirmationRecord(record, { acceptTaggedJSON = false } = {}) {
  return computeHash({
    domain: SEAL_DOMAINS.AFFIRMATION_RECORD,
    body: affirmationSealBody(record),
    acceptTaggedJSON,
  });
}

// `record` must be plain data in the form it will be read back in (see
// AffirmationArtifact.buildSealed) and carry signingKeyId.
function sealAffirmationRecord(record) {
  if (!record.signingKeyId) throw new KeyringError("Affirmation record is missing signingKeyId");
  const entryHash = hashAffirmationRecord(record);
  return { entryHash, entrySignature: sign(entryHash, record.signingKeyId) };
}

function verifyAffirmationRecordSeal(record, { publicKeys = null, acceptTaggedJSON = false } = {}) {
  const expected = hashAffirmationRecord(record, { acceptTaggedJSON });
  const hashOk = expected === record.entryHash;
  let signatureOk = false;
  try {
    signatureOk = verifySignature(
      record.entryHash,
      record.entrySignature,
      publicKeyFor(record.signingKeyId, publicKeys),
    );
  } catch {
    signatureOk = false; // unknown key id: not verified
  }
  return { ok: hashOk && signatureOk, hashOk, signatureOk, expected, actual: record.entryHash };
}

// -----------------------------------------------------
// Receipt input commitment
// -----------------------------------------------------
// Replaces sha256(tenantSalt + JSON) (B-35, B-24): the salt was stored
// in plaintext, so anyone who could read corebookinstances could forge a
// commitment, and an instance without one (the Platform Ledger) couldn't
// issue receipts. Computed over the bundle exactly as stored.

function sealReceiptInput({ tenantId, bundle, keyId }) {
  const inputCommitHash = computeHash({ domain: SEAL_DOMAINS.RECEIPT_INPUT, body: { tenantId, bundle } });
  return { inputCommitHash, inputCommitSignature: sign(inputCommitHash, keyId) };
}

function verifyReceiptInputCommit(receipt, { publicKeys = null, acceptTaggedJSON = false } = {}) {
  if (!receipt.signingKeyId || !receipt.inputCommitSignature) {
    return { ok: false, reason: "UNSIGNED" };
  }
  const expected = computeHash({
    domain: SEAL_DOMAINS.RECEIPT_INPUT,
    body: { tenantId: receipt.tenantNamespace?.tenantId, bundle: receipt.canonicalInputBundle },
    acceptTaggedJSON,
  });
  const hashOk = expected === receipt.inputCommitHash;
  const signatureOk = verifySignature(
    receipt.inputCommitHash,
    receipt.inputCommitSignature,
    publicKeyFor(receipt.signingKeyId, publicKeys),
  );
  return { ok: hashOk && signatureOk, hashOk, signatureOk };
}

module.exports = {
  SEAL_DOMAINS,
  SEAL_FORMAT_VERSION,
  KeyringError,
  initKeyring,
  activeKeyId,
  exportPublicKeys,
  importPublicKey,
  computeHash,
  verifySignature,
  hashLedgerEntry,
  sealLedgerEntry,
  verifyLedgerEntrySeal,
  sealReceiptInput,
  verifyReceiptInputCommit,
  hashEnforcementRecord,
  sealEnforcementRecord,
  verifyEnforcementRecordSeal,
  hashAffirmationRecord,
  sealAffirmationRecord,
  verifyAffirmationRecordSeal,
  // exported for tests only
  _loadKeyring: loadKeyring,
};
