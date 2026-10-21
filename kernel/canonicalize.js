"use strict";

/**
 * =====================================================
 * CANONICAL SERIALIZER
 * =====================================================
 *
 * One byte-exact encoding for every object the kernel seals.
 * JSON.stringify is NOT canonical: key order follows insertion
 * order, so {a,b} and {b,a} hash differently even though Mongo
 * stores and returns them as the same document. That, plus
 * hashing an object that differs from what was persisted, is the
 * root of B-01, B-04, B-13, B-14 and B-32.
 *
 * Rules (JCS-style, RFC 8785 in spirit):
 *   - object keys sorted by UTF-16 code unit
 *   - keys whose value is undefined are omitted (Mongo omits them too)
 *   - undefined inside an array is an error (JSON would silently null it)
 *   - non-finite numbers, bigint, functions, symbols are errors
 *   - -0 encodes as 0
 *   - BSON types are tagged so a string can never collide with one:
 *       Date     -> {"$date":"<ISO-8601>"}
 *       ObjectId -> {"$oid":"<24 hex>"}
 *       Buffer   -> {"$bin":"<base64>"}
 *   - plain-object keys starting with "$" are rejected, which is what
 *     makes the tags above unambiguous
 *   - any other class instance (Map, Decimal128, Long, a Mongoose
 *     document...) is an error: callers must hand in plain data
 *
 * Fails closed: anything it can't encode unambiguously throws.
 *
 * TAGGED-JSON MODE ({ acceptTaggedJSON: true }):
 * An export can't carry BSON types -- JSON turns ObjectIds and Dates
 * into plain strings. Exports therefore write them in exactly the tagged
 * form above ({"$oid":"..."}, {"$date":"..."}, {"$bin":"..."}; see
 * toTaggedJSON). In tagged mode those single-key objects are accepted
 * and encode byte-for-byte the same as the original BSON value, so a
 * hash recomputed from an export equals the hash recomputed from the
 * database. Normal mode still rejects every "$" key, which is what
 * keeps the two forms from ever colliding.
 */

class CanonicalizationError extends Error {
  constructor(message) {
    super(message);
    this.name = "CanonicalizationError";
  }
}

function isObjectId(v) {
  return (
    v != null &&
    (v._bsontype === "ObjectId" || v._bsontype === "ObjectID") &&
    typeof v.toHexString === "function"
  );
}

const TAGS = new Set(["$oid", "$date", "$bin"]);

function isTagged(v) {
  if (!v || typeof v !== "object" || Array.isArray(v)) return false;
  const keys = Object.keys(v);
  return keys.length === 1 && TAGS.has(keys[0]) && typeof v[keys[0]] === "string";
}

function encode(v, path, opts) {
  if (v === null) return "null";

  switch (typeof v) {
    case "string":
      return JSON.stringify(v);
    case "boolean":
      return v ? "true" : "false";
    case "number":
      if (!Number.isFinite(v)) {
        throw new CanonicalizationError(`Non-finite number at ${path}`);
      }
      return Object.is(v, -0) ? "0" : JSON.stringify(v);
    case "object":
      break;
    default:
      throw new CanonicalizationError(`Unsupported type "${typeof v}" at ${path}`);
  }

  if (v instanceof Date) {
    if (Number.isNaN(v.getTime())) {
      throw new CanonicalizationError(`Invalid Date at ${path}`);
    }
    return `{"$date":${JSON.stringify(v.toISOString())}}`;
  }

  if (isObjectId(v)) {
    return `{"$oid":${JSON.stringify(v.toHexString())}}`;
  }

  if (Buffer.isBuffer(v)) {
    return `{"$bin":${JSON.stringify(v.toString("base64"))}}`;
  }

  if (opts.acceptTaggedJSON && isTagged(v)) {
    const [tag] = Object.keys(v);
    return `{${JSON.stringify(tag)}:${JSON.stringify(v[tag])}}`;
  }

  if (Array.isArray(v)) {
    const parts = v.map((item, i) => {
      if (item === undefined) {
        throw new CanonicalizationError(`undefined array element at ${path}[${i}]`);
      }
      return encode(item, `${path}[${i}]`, opts);
    });
    return `[${parts.join(",")}]`;
  }

  const proto = Object.getPrototypeOf(v);
  if (proto !== Object.prototype && proto !== null) {
    const name = (v.constructor && v.constructor.name) || "unknown";
    throw new CanonicalizationError(`Unsupported object type "${name}" at ${path}`);
  }

  const keys = Object.keys(v)
    .filter((k) => v[k] !== undefined)
    .sort();

  const parts = keys.map((k) => {
    if (k.startsWith("$")) {
      throw new CanonicalizationError(`Reserved "$" key "${k}" at ${path}`);
    }
    return `${JSON.stringify(k)}:${encode(v[k], `${path}.${k}`, opts)}`;
  });

  return `{${parts.join(",")}}`;
}

function canonicalize(value, { acceptTaggedJSON = false } = {}) {
  return encode(value, "$", { acceptTaggedJSON });
}

/**
 * Convert stored data to tagged JSON for export: ObjectId -> {"$oid"},
 * Date -> {"$date"}, Buffer -> {"$bin"}. The result survives
 * JSON.stringify/parse and canonicalizes identically in tagged mode.
 */
function toTaggedJSON(v) {
  if (v === null || typeof v !== "object") return v;
  if (v instanceof Date) return { $date: v.toISOString() };
  if (isObjectId(v)) return { $oid: v.toHexString() };
  if (Buffer.isBuffer(v)) return { $bin: v.toString("base64") };
  if (Array.isArray(v)) return v.map(toTaggedJSON);
  const out = {};
  for (const [k, val] of Object.entries(v)) {
    if (val !== undefined) out[k] = toTaggedJSON(val);
  }
  return out;
}

module.exports = { canonicalize, toTaggedJSON, CanonicalizationError };
