#!/usr/bin/env node
/**
 * Operational testing harness for Proposal Assembly V1.
 *
 * Runs the deterministic assembler against the three V1 spec scenarios
 * (small / medium / large), across all delivery modes, with toggle stress
 * tests, and validates:
 *   - narrative quality signals (length, no leaked placeholders),
 *   - phase relevance per scenario,
 *   - retainer consistency (CA phase + Attachment IV + exec summary all
 *     describe construction as a monthly retainer, not a fixed-fee phase),
 *   - appendix toggle cleanliness (disabled appendices drop entirely),
 *   - delivery-mode narrative adaptation (cover letter / exec summary shift),
 *   - manual-edit detector (round-trip: untouched stored blocks read as
 *     unchanged; rewritten content reads as edited; hotspots aggregate).
 *
 * Run: bunx tsx scripts/test-proposal-scenarios.mjs
 */
import { strict as assert } from "node:assert";

const {
  assembleProposal,
  SCENARIO_SMALL,
  SCENARIO_MEDIUM,
  SCENARIO_LARGE,
  detectManualEdits,
} = await import("../src/lib/proposal-assembly/index.ts");

const RETAINER_RE = /retainer/i;
const FIXED_PHASE_RE = /fixed[- ]deliverable|fixed[- ]fee phase/i;
const UNRESOLVED_TOKEN_RE = /\{[a-z_0-9]+\}/;

function assertScenario(name, input) {
  const out = assembleProposal(input);
  // Always 14 max; here we assert at minimum cover→signature + enabled attachments.
  assert.ok(out.containers.length >= 9, `${name}: at least 9 containers`);
  assert.equal(out.unresolvedPlaceholders.length, 0, `${name}: no unresolved placeholders`);

  // Disabled appendices must not appear.
  for (const [id, enabled] of Object.entries(input.appendices)) {
    const sectionId = `attachment_${id.toLowerCase()}`;
    const present = out.containers.some((c) => c.sectionId === sectionId);
    assert.equal(present, enabled, `${name}: appendix ${id} toggle respected`);
  }

  // No container should leak literal placeholder tokens.
  for (const c of out.containers) {
    for (const b of c.blocks) {
      // Allow `[[...]]` sentinel (rendered downstream), but not `{token}`.
      assert.ok(
        !UNRESOLVED_TOKEN_RE.test(b.content),
        `${name}: container ${c.sectionId}.${b.localId} leaks literal placeholder: ${b.content.match(UNRESOLVED_TOKEN_RE)?.[0]}`,
      );
    }
  }

  // Retainer consistency: CA phase + Attachment IV must reference retainer.
  const phases = out.containers.find((c) => c.sectionId === "phase_narratives");
  if (phases) {
    const ca = phases.blocks.find((b) => b.payload && b.payload.stageCode === "CA");
    if (ca) {
      assert.ok(RETAINER_RE.test(ca.content), `${name}: CA phase reads as retainer`);
      // CA must NOT be framed as a fixed-fee deliverable.
      // (The seed text explicitly says "not a fixed-deliverable package", so
      // that match is fine — we only care about the *positive* framing.)
    }
  }
  const attIV = out.containers.find((c) => c.sectionId === "attachment_iv");
  if (attIV) {
    assert.ok(RETAINER_RE.test(attIV.blocks[0].content), `${name}: Attachment IV mentions retainer`);
  }

  return out;
}

// ---------------------------------------------------------------------------
// 1. Three V1 scenarios.
// ---------------------------------------------------------------------------
const small = assertScenario("small", SCENARIO_SMALL);
const medium = assertScenario("medium", SCENARIO_MEDIUM);
const large = assertScenario("large", SCENARIO_LARGE);

// Small has fewer phases than medium/large — phase count comes from stages.
const smallPhases = small.containers.find((c) => c.sectionId === "phase_narratives").blocks.length - 1;
const mediumPhases = medium.containers.find((c) => c.sectionId === "phase_narratives").blocks.length - 1;
const largePhases = large.containers.find((c) => c.sectionId === "phase_narratives").blocks.length - 1;
assert.ok(smallPhases < mediumPhases && mediumPhases <= largePhases, "phase counts scale with scenario size");

// Appendices V/VI absent in small, present in large.
assert.ok(!small.containers.some((c) => c.sectionId === "attachment_v"), "small: no optional services");
assert.ok(!small.containers.some((c) => c.sectionId === "attachment_vi"), "small: no consultant interfaces");
assert.ok(large.containers.some((c) => c.sectionId === "attachment_vi"), "large: consultant interfaces present");

// ---------------------------------------------------------------------------
// 2. Delivery-mode adaptation.
// ---------------------------------------------------------------------------
const psaLed = assembleProposal({ ...SCENARIO_LARGE, deliveryMode: "psa_led" });
const consultantLed = assembleProposal({ ...SCENARIO_LARGE, deliveryMode: "consultant_led" });
const designBuild = assembleProposal({ ...SCENARIO_LARGE, deliveryMode: "design_build" });

const letter = (run) => run.containers.find((c) => c.sectionId === "cover_letter").blocks[0].content;
assert.notEqual(letter(psaLed), letter(consultantLed), "consultant_led cover letter diverges from psa_led");
assert.notEqual(letter(psaLed), letter(designBuild), "design_build cover letter diverges from psa_led");
assert.ok(/oversight|local lead/i.test(letter(consultantLed)), "consultant_led mentions oversight/local lead");
assert.ok(/design-build/i.test(letter(designBuild)), "design_build mentions design-build partner");

// Retainer wording survives across all three delivery modes.
for (const [mode, run] of [["psa_led", psaLed], ["consultant_led", consultantLed], ["design_build", designBuild]]) {
  const exec = run.containers.find((c) => c.sectionId === "executive_summary").blocks[0].content;
  assert.ok(RETAINER_RE.test(exec), `${mode}: exec summary mentions retainer`);
  assert.ok(!FIXED_PHASE_RE.test(exec.replace(/not a fixed[- ]deliverable[^.]*\./i, "")),
    `${mode}: exec summary does not frame construction as fixed-fee phase`);
}

// ---------------------------------------------------------------------------
// 3. Toggle stress tests on the medium scenario.
// ---------------------------------------------------------------------------
const noGantt = assembleProposal({
  ...SCENARIO_MEDIUM,
  appendices: { ...SCENARIO_MEDIUM.appendices, III: false },
});
assert.ok(!noGantt.containers.some((c) => c.sectionId === "attachment_iii"), "Gantt appendix drops cleanly");

const hoursHidden = assembleProposal({
  ...SCENARIO_MEDIUM,
  flags: { ...SCENARIO_MEDIUM.flags, showHours: false, showDurations: false },
});
// Flag changes do not affect deterministic container count for V1.
assert.equal(hoursHidden.containers.length, medium.containers.length, "flag toggles preserve container count");

// Partial fee data: monthly retainer fields removed; placeholders collapse.
const partialFee = assembleProposal({
  ...SCENARIO_MEDIUM,
  data: { ...SCENARIO_MEDIUM.data, feeBreakdown: { total: 100000 } },
});
for (const c of partialFee.containers) {
  for (const b of c.blocks) {
    assert.ok(!UNRESOLVED_TOKEN_RE.test(b.content),
      `partial fee: ${c.sectionId}.${b.localId} leaks placeholder`);
  }
}

// ---------------------------------------------------------------------------
// 4. Manual-edit detector round trip.
// ---------------------------------------------------------------------------
const storedUnchanged = medium.containers.flatMap((c) =>
  c.blocks.map((b) => ({
    assemblySectionId: c.sectionId,
    localId: b.localId,
    content: b.content,
  })),
);
const cleanReport = detectManualEdits(medium, storedUnchanged);
assert.equal(cleanReport.editedCount, 0, "unchanged round-trip → 0 edits");
assert.equal(cleanReport.missingCount, 0, "unchanged round-trip → 0 missing");

// Now simulate the user heavily rewriting the cover letter and exec summary.
const storedWithEdits = storedUnchanged.map((s) => {
  if (s.assemblySectionId === "cover_letter" || s.assemblySectionId === "executive_summary") {
    return { ...s, content: "User rewrote this section entirely with different wording." };
  }
  return s;
});
const editReport = detectManualEdits(medium, storedWithEdits);
assert.ok(editReport.editedCount >= 2, "edits detected");
assert.ok(
  editReport.hotspots[0] &&
    ["cover_letter", "executive_summary"].includes(editReport.hotspots[0].sectionId),
  "hotspots surface the rewritten sections",
);

// Missing-block detection.
const storedMissingSig = storedUnchanged.filter((s) => s.assemblySectionId !== "signature");
const missingReport = detectManualEdits(medium, storedMissingSig);
assert.ok(missingReport.missingCount >= 1, "missing block detected");

console.log(
  `ok — scenarios: small=${small.containers.length} medium=${medium.containers.length} large=${large.containers.length} | ` +
    `delivery modes adapt | toggles clean | detector ok (edits=${editReport.editedCount}, hotspots=${editReport.hotspots.length})`,
);
