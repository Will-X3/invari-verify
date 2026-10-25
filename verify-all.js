#!/usr/bin/env node
"use strict";

/**
 * Runs every case in ./cases and checks each against its expected result.
 *
 *   node verify-all.js            run every case
 *   node verify-all.js M2         run one case
 *
 * Each case folder holds a case.json:
 *   {
 *     "id": "M2",
 *     "title": "...",
 *     "export": "asset-export.json",
 *     "receipt": "receipt-rcpt_....json",
 *     "expectHead": "<entryHash published as the checkpoint>",   // optional
 *     "expect": "PASS"                                            // or "FAIL" for a tamper test
 *   }
 *
 * A refusal that never reached the kernel has no receipt; its case is
 * "kind": "record" and names the signed refusal record instead:
 *   { "id": "R1", "kind": "record", "record": "refusal-record.json",
 *     "previousActor": "previous-actor-record.json",            // optional
 *     "expect": "PASS" }
 *
 * Uses the root public-keys.json for every case -- never a key shipped inside a
 * case folder. Compare that file with the key published on invari.systems.
 *
 * No npm install, no network. Exit code 0 only if every case produced its
 * expected result.
 */

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const root = __dirname;
const casesDir = path.join(root, "cases");
const verifier = path.join(root, "kernel", "tools", "verifyRejection.js");
const recordVerifier = path.join(root, "kernel", "tools", "verifyRefusalRecord.js");
const keys = path.join(root, "public-keys.json");
const only = process.argv[2];

const cases = fs
  .readdirSync(casesDir, { withFileTypes: true })
  .filter((d) => d.isDirectory() && !d.name.startsWith("_") && (!only || d.name === only))
  .map((d) => d.name)
  .sort();

if (!cases.length) {
  console.error(only ? `No case named ${only}.` : "No cases found.");
  process.exit(2);
}

const rows = [];
let allOk = true;

for (const name of cases) {
  const dir = path.join(casesDir, name);
  const cfgPath = path.join(dir, "case.json");
  if (!fs.existsSync(cfgPath)) {
    rows.push([name, "-", "-", "SKIPPED (no case.json)"]);
    continue;
  }
  const cfg = JSON.parse(fs.readFileSync(cfgPath, "utf8"));
  let args;
  if (cfg.kind === "record") {
    args = [recordVerifier, path.join(dir, cfg.record), keys];
    if (cfg.previousActor) args.push("--previous-actor", path.join(dir, cfg.previousActor));
  } else {
    args = [verifier, path.join(dir, cfg.export), path.join(dir, cfg.receipt), keys];
    if (cfg.expectHead) args.push("--expect-head", cfg.expectHead);
  }

  const run = spawnSync(process.execPath, args, { encoding: "utf8" });
  const out = `${run.stdout || ""}${run.stderr || ""}`;
  const got = run.status === 0 && /RESULT: PASS/.test(out) ? "PASS" : "FAIL";
  const expected = (cfg.expect || "PASS").toUpperCase();
  const ok = got === expected;
  if (!ok) allOk = false;
  rows.push([name, expected, got, ok ? "as expected" : "UNEXPECTED"]);

  if (only || !ok) {
    console.log(`\n--- ${name}: ${cfg.title || ""} ---\n${out.trim()}\n`);
  }
}

const w = [6, 9, 7, 12];
const line = (r) => r.map((c, i) => String(c).padEnd(w[i])).join("  ");
console.log(`\n${line(["Case", "Expected", "Got", ""])}`);
console.log(line(w.map((n) => "-".repeat(n))));
rows.forEach((r) => console.log(line(r)));
console.log(`\n${allOk ? "ALL CASES AS EXPECTED" : "SOME CASES DID NOT MATCH -- see output above"}`);
process.exit(allOk ? 0 : 1);
