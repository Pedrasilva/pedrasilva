#!/usr/bin/env node
/**
 * Smoke test for the Proposal Container & Assembly Layer V1.
 * Runs the deterministic assembler against a fixture and asserts:
 *   - main + attachment section order
 *   - placeholder resolution for the V1 catalog
 *   - appendix toggle behaviour
 *   - deterministic container ids across two runs
 *
 * Run: node scripts/test-proposal-assembly.mjs
 */
import { strict as assert } from "node:assert";

const { assembleProposal } = await import("../src/lib/proposal-assembly/assemble.ts");

const fixture = {
  family: "workplace",
  preset: "large_corporate_fitout",
  deliveryMode: "psa_led",
  language: "en",
  flags: { showHours: true, showDurations: true, showConsultantTrack: false },
  addOns: ["BIM Level 2"],
  appendices: { I: true, II: true, III: true, IV: true, V: true, VI: false },
  assemblyKey: "quote-123:v1",
  data: {
    quote: {
      id: "quote-123",
      code: "PSA-2026-001",
      title: "Acme HQ Fitout",
      project_name: "Acme HQ Fitout",
      client_name: "Acme Corp",
      currency: "EUR",
      proposal_date: "2026-05-20",
      proposal_version: "v1",
    },
    stages: [
      { code: "P1", name: "Briefing", duration_days: 10, estimated_hours: 80, fee: 8000 },
      { code: "P2", name: "Concept", duration_days: 20, estimated_hours: 160, fee: 16000 },
      { code: "CA", name: "Construction Assistance", duration_days: 120, estimated_hours: 240, fee: 24000 },
    ],
    paymentSchedule: [
      { label: "Signing", trigger: "on_signature", amount: 8000 },
      { label: "Concept delivery", trigger: "phase_complete", amount: 16000 },
    ],
    feeBreakdown: {
      total: 48000,
      constructionMonthlyFee: 4000,
      constructionMonthlyHours: 40,
      constructionDurationMonths: 6,
    },
    exclusions: ["VAT", "Travel beyond Lisbon metro area"],
  },
};

const a = assembleProposal(fixture);
const b = assembleProposal(fixture);

assert.equal(a.containers.length, b.containers.length, "deterministic length");
assert.deepEqual(
  a.containers.map((c) => c.id),
  b.containers.map((c) => c.id),
  "deterministic container ids",
);

const mainIds = a.containers.filter((c) => c.kind === "main").map((c) => c.sectionId);
assert.deepEqual(mainIds, [
  "cover_page",
  "cover_letter",
  "executive_summary",
  "project_understanding",
  "design_approach",
  "scope_overview",
  "phase_narratives",
  "fee_summary",
  "signature",
]);

const attIds = a.containers.filter((c) => c.kind === "attachment").map((c) => c.sectionId);
assert.deepEqual(attIds, [
  "attachment_i",
  "attachment_ii",
  "attachment_iii",
  "attachment_iv",
  "attachment_v",
]);

// Toggle: disabling appendix VI should keep it out (default off), enabling V should appear.
const withoutV = assembleProposal({
  ...fixture,
  appendices: { ...fixture.appendices, V: false },
});
assert.ok(
  !withoutV.containers.some((c) => c.sectionId === "attachment_v"),
  "appendix V disabled drops container",
);

// Placeholder resolution: exec summary should contain client_name and dates.
const exec = a.containers.find((c) => c.sectionId === "executive_summary");
assert.ok(exec, "exec summary present");
assert.ok(exec.blocks[0].content.includes("Acme Corp"));
assert.ok(exec.blocks[0].content.includes("6"), "construction_duration resolved");

// Phase narrative blocks: one per stage + intro.
const phases = a.containers.find((c) => c.sectionId === "phase_narratives");
assert.equal(phases.blocks.length, 1 + fixture.data.stages.length);

// QA: Construction Assistance phase must read as a monthly retainer, not a
// fixed-deliverable package.
const caBlock = phases.blocks.find((b) => b.payload?.stageCode === "CA");
assert.ok(caBlock, "CA phase block present");
assert.ok(/retainer/i.test(caBlock.content), "CA phase reads as retainer");
assert.ok(
  /not a fixed-deliverable/i.test(caBlock.content),
  "CA phase explicitly distinguishes retainer from fixed deliverables",
);
assert.ok(
  caBlock.content.includes("6") && caBlock.content.includes("€"),
  "CA phase resolves construction_duration + monthly fee",
);

// QA: graceful collapse — partial data should not leave literal `{token}` in
// rendered narrative, and should not produce double blank lines.
const partial = assembleProposal({
  ...fixture,
  data: {
    ...fixture.data,
    feeBreakdown: { total: 48000 }, // no monthly retainer fields
  },
});
const partialExec = partial.containers.find((c) => c.sectionId === "executive_summary");
assert.ok(
  !/\{construction_monthly_fee\}/.test(partialExec.blocks[0].content),
  "empty known placeholders collapse instead of leaking literal tokens",
);
assert.ok(
  !/\n\n\n/.test(partialExec.blocks[0].content),
  "no triple newlines after collapse",
);

// QA: attachment IV references retainer billing explicitly.
const attIV = a.containers.find((c) => c.sectionId === "attachment_iv");
assert.ok(/retainer/i.test(attIV.blocks[0].content), "Attachment IV mentions retainer");

console.log(
  `ok — ${a.containers.length} containers, ${a.unresolvedPlaceholders.length} unresolved placeholders` +
    (a.unresolvedPlaceholders.length ? ` (${a.unresolvedPlaceholders.join(", ")})` : ""),
);
