"use strict";

/**
 * kernel/gateCheck.js (T-88b, R-194) -- INTERPRETIVE gates, re-checked by
 * the kernel inside the commit.
 *
 * Before T-88b a gated commit (Entity_Onboarded) was checked by the
 * controller, at the request's time, before the transaction opened; the
 * kernel then committed with whatever affirmation ids the caller passed as
 * evidenceRefs. An affirmation retracted in between was still cited (Law 2:
 * a proposal is valid only against the state and policy in force at
 * commitment).
 *
 * Now, for an event a domain declares gated (policies/domains/manifests
 * gatesForEvent), the kernel itself, in the commit's session and at its
 * pinned temporalAnchor (tau):
 *
 *   1. reads every affirmation of the gate subject (the submission or
 *      asset the gates belong to) and verifies its chain
 *      (kernel/affirmationChain.js) -- a broken chain refuses;
 *   2. for each declared node, takes the gate's LATEST record at tau and
 *      refuses unless it is an AFFIRM by the node's role, chained
 *      (format 3), and judged under the bundle in force;
 *   3. builds evidenceRefs from those records (the caller may not supply
 *      them for a gated event) and seals gateReads in the entry: the
 *      subject, the bundle by id and version, the chain head at tau, and
 *      each gate's record id, place and hash.
 *
 * gateReads anchors the affirmation chain outside itself: a record a commit
 * relied on -- including the chain's newest -- cannot later disappear
 * without the entry saying so (scripts/verifyChains.js, verifyExport
 * check 9). That closes T-88a's known limit for every gated commit.
 *
 * The one declared exception (Law 0: "any exception, including the
 * system's own genesis, must be declared and recorded"): Invari's own
 * genesis on its sentinel chain has no submission and no gates -- nothing
 * existed yet to govern it. The proposal states gateException
 * { basis: "PLATFORM_SELF_GENESIS" }; it is accepted only for a gated event,
 * on a Platform-owned ledger, on a new chain, while no platform genesis
 * exists; and the entry seals it (gateException { basis, bundleId }).
 * Anywhere else it is refused. T-62 (package #0) replaces it.
 *
 * Residual, stated: affirmations are written outside transactions. One
 * committed after this transaction's snapshot began, but stamped before
 * tau, is not seen here. The window is the transaction's own lifetime;
 * verifyChains reports it after the fact (CITED_NOT_IN_FORCE).
 */

const { verifyAffirmationChain, latestForGate } = require("./affirmationChain");

const GATE_EXCEPTION_BASES = Object.freeze(["PLATFORM_SELF_GENESIS"]);

class GateCheckError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "GateCheckError";
    this.code = code;
  }
}

const isDate = (d) => d instanceof Date && !Number.isNaN(d.getTime());

/**
 * @param {object} p
 * @param {string} p.eventType
 * @param {object|null} p.gateSubject  { subjectType, subjectId } from the caller
 * @param {Date}   p.tau               the kernel's pinned evaluation time
 * @param {object} p.session           the commit's session
 * @param {object} [p.gateException]   { basis } -- the declared genesis exception
 * @param {object} [p.coreBookInstance] the governing instance (ownerEntityType)
 * @param {object|null} [p.head]       the chain head read in this session
 * @param {object} p.deps              { AffirmationArtifact, gatesForEvent, loadPolicyBundle, CoreBookEntry }
 * @returns {Promise<null | { gateReads, evidenceRefs } | { gateException, evidenceRefs }>}
 *          null for an event no domain gates
 */
async function checkGatesInCommit({ eventType, gateSubject, tau, session, deps, gateException = null, coreBookInstance = null, head = null }) {
  const { AffirmationArtifact, gatesForEvent, loadPolicyBundle } = deps;
  if (!isDate(tau)) throw new TypeError("checkGatesInCommit: tau (the pinned evaluation time) is required");

  const decl = gatesForEvent(eventType);

  if (gateException) {
    const refuse = (why) => {
      throw new GateCheckError("GATE_EXCEPTION_REFUSED", `gateException ${JSON.stringify(gateException)} refused: ${why}.`);
    };
    const keys = Object.keys(gateException);
    if (keys.length !== 1 || !GATE_EXCEPTION_BASES.includes(gateException.basis)) refuse(`the only declared basis is ${GATE_EXCEPTION_BASES.join(", ")}`);
    if (!decl) refuse(`${eventType} is not a gated event`);
    if (gateSubject) refuse("a proposal with a gate subject is checked, not excepted");
    if (coreBookInstance?.ownerEntityType !== "Platform") refuse("only the platform's own ledger may take it");
    if (head) refuse("only on a new chain");
    if (!deps.CoreBookEntry) throw new TypeError("checkGatesInCommit: deps.CoreBookEntry is required for a gate exception");
    const prior = await deps.CoreBookEntry.exists({ eventType, "tenantContext.type": "Platform" }).session(session);
    if (prior) refuse("the platform genesis already exists");
    return { evidenceRefs: [], gateException: { basis: gateException.basis, bundleId: decl.bundleId } };
  }

  if (!decl) {
    if (gateSubject) {
      throw new GateCheckError(
        "GATE_SUBJECT_UNEXPECTED",
        `${eventType} is not a gated event; a gate subject was supplied for it.`,
      );
    }
    return null;
  }
  if (!gateSubject || typeof gateSubject.subjectId !== "string" || !gateSubject.subjectId) {
    throw new GateCheckError(
      "GATE_SUBJECT_REQUIRED",
      `${eventType} is gated (${decl.bundleId}); the proposal must name its gate subject.`,
    );
  }
  if (gateSubject.subjectType !== decl.subjectType) {
    throw new GateCheckError(
      "GATE_SUBJECT_TYPE",
      `${eventType}'s gates belong to a ${decl.subjectType}, not a ${gateSubject.subjectType}.`,
    );
  }
  const subjectId = gateSubject.subjectId;

  // 1. The subject's whole chain, read in this session, verified.
  const records = await AffirmationArtifact.find({ assetId: subjectId }).session(session).lean();
  const chain = verifyAffirmationChain(records, { verifyRecord: (r) => AffirmationArtifact.verifyRecord(r) });
  if (!chain.ok) {
    const p = chain.problems[0];
    throw new GateCheckError(
      "AFFIRMATION_CHAIN_INVALID",
      `The affirmation chain of ${subjectId} does not verify (${p.code} at ${p.at ?? "?"}: ${p.detail}). Nothing was committed.`,
    );
  }

  // The bundle in force (T-76 will choose by effective date; today the
  // latest version saved).
  const bundle = loadPolicyBundle(decl.bundleId);
  const bundleRef = { bundleId: bundle.bundleId, version: bundle.version, hash: bundle.natureBundleHash };

  // Only what existed at tau counts: the head is the last link stamped at
  // or before it.
  const atTau = records
    .filter((r) => r.chainSequence !== undefined && r.chainSequence !== null && new Date(r.createdAt) <= tau)
    .sort((a, b) => a.chainSequence - b.chainSequence);
  const chainHeadAtTau = atTau[atTau.length - 1] ?? null;

  // 2. Each declared gate's deciding record.
  const gates = [];
  for (const node of decl.nodes) {
    const d = latestForGate(atTau, { nodeRef: node.id, tau });
    if (!d || !AffirmationArtifact.clearsGate(d, { actorRole: node.actorRole })) {
      throw new GateCheckError(
        "GATE_NOT_CLEARED",
        `Gate ${node.id} of ${subjectId} is not cleared at ${tau.toISOString()}` +
          (d ? ` (its latest record is a ${d.response} by ${d.actor?.actionRole})` : " (no record)") +
          ". Nothing was committed.",
      );
    }
    if (d.natureBundleHash !== bundle.natureBundleHash) {
      throw new GateCheckError(
        "GATE_BUNDLE_STALE",
        `Gate ${node.id} was affirmed under natureBundleHash ${d.natureBundleHash}, not the ${decl.bundleId}@${bundle.version} in force. Affirm it again.`,
      );
    }
    gates.push({ nodeRef: node.id, recordId: d._id, chainSequence: d.chainSequence, entryHash: d.entryHash });
  }

  return {
    evidenceRefs: gates.map((g) => g.recordId),
    gateReads: {
      subjectType: decl.subjectType,
      subjectId,
      bundleRef,
      chainHead: { chainSequence: chainHeadAtTau.chainSequence, entryHash: chainHeadAtTau.entryHash },
      gates,
    },
  };
}

/**
 * Pure: does a sealed entry's gateReads agree with the subject's
 * affirmation records (from the database or an export)? Returns problem
 * strings; [] when it does. Used by scripts/verifyChains.js and
 * kernel/tools/verifyExport.js (check 9).
 */
function gateReadsProblems(entry, records, { idOf, timeOf }) {
  const g = entry.gateReads;
  if (!g) return [];
  const out = [];
  const bySeq = new Map(records.filter((r) => r.chainSequence != null).map((r) => [r.chainSequence, r]));
  const headRec = bySeq.get(g.chainHead?.chainSequence);
  if (!headRec) out.push(`gateReads.chainHead #${g.chainHead?.chainSequence} is missing from the subject's chain`);
  else if (headRec.entryHash !== g.chainHead.entryHash) out.push(`the record at the sealed head #${g.chainHead.chainSequence} is not the one the commit read`);
  const upToHead = records.filter((r) => r.chainSequence != null && r.chainSequence <= (g.chainHead?.chainSequence ?? 0));
  const evidence = (entry.evidenceRefs || []).map(idOf);
  if (evidence.length !== (g.gates || []).length || (g.gates || []).some((x, i) => idOf(x.recordId) !== evidence[i])) {
    out.push("evidenceRefs are not the gate records gateReads names");
  }
  for (const x of g.gates || []) {
    const rec = bySeq.get(x.chainSequence);
    if (!rec || idOf(rec._id) !== idOf(x.recordId) || rec.entryHash !== x.entryHash) {
      out.push(`gate ${x.nodeRef}: the record the commit read (#${x.chainSequence}) is not in the chain as sealed`);
      continue;
    }
    const d = latestForGate(upToHead, { nodeRef: x.nodeRef, tau: entry.eventTimestamp });
    if (!d || idOf(d._id) !== idOf(x.recordId)) out.push(`gate ${x.nodeRef}: #${x.chainSequence} was not the gate's latest record at the commit`);
    if (rec.response !== "AFFIRM") out.push(`gate ${x.nodeRef}: #${x.chainSequence} is a ${rec.response}`);
    if (!(timeOf(rec.createdAt) <= timeOf(entry.eventTimestamp))) out.push(`gate ${x.nodeRef}: #${x.chainSequence} is stamped after the commit`);
  }
  return out;
}

/** Pure: a sealed gateException is only ever the platform's own genesis. */
function gateExceptionProblems(entry) {
  const x = entry.gateException;
  if (!x) return [];
  const out = [];
  const v = typeof entry.version === "object" ? Number(entry.version?.$numberInt ?? NaN) : entry.version;
  if (!GATE_EXCEPTION_BASES.includes(x.basis)) out.push(`gateException basis ${JSON.stringify(x.basis)} is not declared`);
  if (v !== 1) out.push(`gateException on v${v} -- only a genesis entry may carry it`);
  if (entry.tenantContext?.type !== "Platform") out.push("gateException on a ledger that is not the platform's");
  if (entry.gateReads) out.push("an entry cannot carry both gateException and gateReads");
  return out;
}

module.exports = { checkGatesInCommit, gateReadsProblems, gateExceptionProblems, GateCheckError, GATE_EXCEPTION_BASES };
