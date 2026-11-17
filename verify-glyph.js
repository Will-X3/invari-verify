#!/usr/bin/env node
"use strict";

/**
 * verify-glyph.js -- checks the published .Glyph files without Invari's code.
 *
 * glyph/ holds every published version of the three .Glyph descriptions the
 * kernel judges by: the shared ISA (the vocabulary), the frame ABI (the
 * 160-byte frame layout) and the conditions grammar. Each is identified by
 * the SHA-256 of its own canonical JSON (keys sorted, no whitespace), and
 * each names the one before it in `previous: { version, hash }`.
 *
 * This script, written apart from the kernel:
 *   1. recomputes every file's hash from its content;
 *   2. checks each name forms one unbroken chain: a single first version
 *      (no previous, or previous hash null), every later version naming an earlier one by
 *      hash, no fork, no gap;
 *   3. checks each head (and every version) equals the hash published in
 *      CHECKPOINTS.md, under ".Glyph files".
 *
 * No npm install, no network. Run: node verify-glyph.js
 */

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const DIR = path.join(__dirname, "glyph");
const CHECKPOINTS = path.join(__dirname, "CHECKPOINTS.md");

function canonical(v) {
  if (v === null || typeof v !== "object") {
    if (typeof v === "number" && !Number.isFinite(v))
      throw new Error("non-finite number");
    return v;
  }
  if (Array.isArray(v)) return v.map(canonical);
  const out = {};
  for (const k of Object.keys(v).sort()) out[k] = canonical(v[k]);
  return out;
}
const sha256 = (v) =>
  crypto
    .createHash("sha256")
    .update(JSON.stringify(canonical(v)), "utf8")
    .digest("hex");

let failed = 0;
const ok = (m) => console.log(`OK    ${m}`);
const bad = (m) => {
  failed++;
  console.log(`FAIL  ${m}`);
};

// Published hashes: CHECKPOINTS.md rows "| `name` | version | `hash` | ... |"
const published = new Map();
if (fs.existsSync(CHECKPOINTS)) {
  const text = fs.readFileSync(CHECKPOINTS, "utf8");
  const section = text.split(/^## \.Glyph files/m)[1];
  if (section) {
    for (const line of section.split(/\r?\n/)) {
      if (/^## /.test(line)) break;
      const m = line.match(
        /^\|\s*`([a-z0-9.-]+)`\s*\|\s*([0-9.]+)\s*\|\s*`([0-9a-f]{64})`/,
      );
      if (m) published.set(`${m[1]}@${m[2]}`, m[3]);
    }
  }
}
if (published.size === 0) bad('CHECKPOINTS.md has no ".Glyph files" rows');

const files = fs
  .readdirSync(DIR)
  .filter((f) => f.endsWith(".json"))
  .sort();
const byName = new Map();
for (const f of files) {
  let d;
  try {
    d = JSON.parse(fs.readFileSync(path.join(DIR, f), "utf8"));
  } catch (e) {
    bad(`${f}: not JSON (${e.message})`);
    continue;
  }
  const { name, version } = d;
  // A first version has no `previous`, or one whose hash is null (ABI 2:
  // version 1 was never published as a file).
  const previous = d.previous ?? { version: null, hash: null };
  if (typeof name !== "string" || version == null) {
    bad(`${f}: needs name and version`);
    continue;
  }
  const hash = sha256(d);
  const key = `${name}@${version}`;
  if (f !== `${name}-${version}.json`)
    bad(`${f}: file name should be ${name}-${version}.json`);
  const pub = published.get(key);
  if (!pub)
    bad(`${key}: ${hash.slice(0, 12)}... is not published in CHECKPOINTS.md`);
  else if (pub !== hash)
    bad(
      `${key}: recomputes to ${hash.slice(0, 12)}..., CHECKPOINTS.md says ${pub.slice(0, 12)}...`,
    );
  else ok(`${key}  ${hash}`);
  if (!byName.has(name)) byName.set(name, []);
  byName.get(name).push({ f, version: String(version), previous, hash });
}

for (const [name, list] of byName) {
  const byHash = new Map(list.map((x) => [x.hash, x]));
  const firsts = list.filter((x) => x.previous.hash === null);
  if (firsts.length !== 1) {
    bad(
      `${name}: ${firsts.length} first versions (no previous, or previous hash null); want exactly 1`,
    );
    continue;
  }
  const children = new Map();
  let broken = false;
  for (const x of list) {
    if (x.previous.hash === null) continue;
    const p = byHash.get(x.previous.hash);
    if (!p) {
      bad(
        `${name}@${x.version}: previous ${String(x.previous.hash).slice(0, 12)}... is not in glyph/`,
      );
      broken = true;
      continue;
    }
    if (String(x.previous.version) !== p.version) {
      bad(
        `${name}@${x.version}: previous says version ${x.previous.version}, that hash is ${p.version}`,
      );
      broken = true;
    }
    if (children.has(p.hash)) {
      bad(`${name}: fork after ${p.version}`);
      broken = true;
    }
    children.set(p.hash, x);
  }
  let cur = firsts[0];
  const walk = [cur.version];
  while (children.has(cur.hash)) {
    cur = children.get(cur.hash);
    walk.push(cur.version);
  }
  if (walk.length !== list.length) {
    bad(`${name}: chain reaches ${walk.length} of ${list.length} versions`);
  } else if (!broken) {
    ok(
      `${name}: one chain ${walk.join(" -> ")}, head ${cur.hash.slice(0, 12)}...`,
    );
  }
}

for (const key of published.keys()) {
  const [name, version] = key.split("@");
  if (!byName.get(name)?.some((x) => x.version === version))
    bad(`${key} is published in CHECKPOINTS.md but missing from glyph/`);
}

console.log("");
console.log(failed ? `RESULT: FAIL (${failed})` : "RESULT: PASS");
process.exit(failed ? 1 : 0);
