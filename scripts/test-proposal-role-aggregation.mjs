#!/usr/bin/env node
// Quick correctness check for the proposal-role aggregator.
import { aggregateAllocationsByProposalRole } from "../src/lib/proposal-roles/aggregate.ts";

const resources = [
  { id: "r1", proposal_role: "Senior Architect" },
  { id: "r2", proposal_role: "Senior Architect" },
  { id: "r3", proposal_role: "Architect" },
  { id: "r4", proposal_role: null },
];

const allocations = [
  { resource_id: "r1", hours: 40 },
  { resource_id: "r2", hours: 40 },
  { resource_id: "r3", hours: 40 },
  { resource_id: "r4", hours: 10 },
  { resource_id: null, hours: 99 },
];

const result = aggregateAllocationsByProposalRole(allocations, resources);

const expected = [
  { role: "Senior Architect", hours: 80, resourceCount: 2 },
  { role: "Architect", hours: 40, resourceCount: 1 },
  { role: null, hours: 10, resourceCount: 1 },
];

const ok = JSON.stringify(result) === JSON.stringify(expected);
console.log("result:  ", JSON.stringify(result));
console.log("expected:", JSON.stringify(expected));
if (!ok) {
  console.error("FAIL");
  process.exit(1);
}
console.log("OK — aggregator groups by proposal_role and never exposes ids/names.");
