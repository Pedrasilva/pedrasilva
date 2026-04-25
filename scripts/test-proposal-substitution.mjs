#!/usr/bin/env node
/**
 * Defensive checks for proposal variable substitution + post-substitution
 * cleanup. Verifies that:
 *
 *  1. A defined-but-empty variable is substituted to "" (never left as
 *     `{{var}}` in client-facing copy).
 *  2. Awkward fragments left behind by an empty `project_location` /
 *     `project_brief` are cleaned up so the surrounding sentence still
 *     reads naturally.
 *  3. Truly unknown variables fall through unchanged so missing keys
 *     are still noticed during template authoring.
 *
 * Pure-JS reimplementation of the production helpers in
 * `src/lib/quotes/proposal-generator.ts` — kept in sync intentionally so
 * this script can run under plain `node` with no TS toolchain.
 */

const VAR_TOKEN_RE = /\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g;

function cleanupEmptyPhrases(text) {
  if (!text) return text;
  let out = text;
  out = out.replace(/\bis\s+located\s+in\s*(?=[.,;:!?\n)]|$)/gi, "");
  out = out.replace(/,\s*located in\s*(?=[.,;:!?\n)]|$)/gi, "");
  out = out.replace(/\blocated in\s*(?=[.,;:!?\n)]|$)/gi, "");
  out = out.replace(/\s+in\s*(?=[.,;:!?\n)])/gi, "");
  out = out.replace(/\s+\bis\s*(?=[.,;:!?])/gi, "");
  out = out.replace(/\s+\bis\s*$/gim, "");
  out = out.replace(/\s+([.,;:!?])/g, "$1");
  out = out
    .split("\n")
    .map((line) => {
      const trimmed = line.replace(/\s{2,}/g, " ").trimEnd();
      if (/^[\s.,;:]*$/.test(trimmed)) return "";
      if (/[*_]/.test(trimmed)) {
        const bare = trimmed.replace(/[*_]/g, "").trim();
        if (/^[A-Za-z0-9][^.,;:!?]*\.$/.test(bare)) {
          const wordCount = bare.slice(0, -1).trim().split(/\s+/).length;
          if (wordCount <= 4) return "";
        }
      }
      return trimmed;
    })
    .join("\n");
  out = out.replace(/\n{3,}/g, "\n\n");
  out = out.replace(/[ \t]{2,}/g, " ");
  return out;
}

function substituteVariables(template, variables) {
  const replaced = template.replace(VAR_TOKEN_RE, (match, key) => {
    return Object.prototype.hasOwnProperty.call(variables, key)
      ? variables[key]
      : match;
  });
  return cleanupEmptyPhrases(replaced);
}

let failed = 0;
function assertEq(label, actual, expected) {
  const ok = actual === expected;
  if (ok) {
    console.log(`✓ ${label}`);
  } else {
    failed += 1;
    console.error(`✗ ${label}`);
    console.error(`  expected: ${JSON.stringify(expected)}`);
    console.error(`  actual:   ${JSON.stringify(actual)}`);
  }
}

const vars = {
  client_name: "Acme",
  project_name: "Lighthouse",
  project_location: "",
  project_brief: "",
};

assertEq(
  "defined-but-empty variable substitutes to empty string (no raw token)",
  substituteVariables("Project {{project_name}} in {{project_location}}.", vars),
  "Project Lighthouse.",
);

assertEq(
  "awkward `, located in ` fragment is removed when location is empty",
  substituteVariables(
    "Thank you for the opportunity to submit our proposal for **{{project_name}}**, located in {{project_location}}.",
    vars,
  ),
  "Thank you for the opportunity to submit our proposal for **Lighthouse**.",
);

assertEq(
  "unknown variable is left alone for template authors to notice",
  substituteVariables("Hello {{unknown_var}}", vars),
  "Hello {{unknown_var}}",
);

assertEq(
  "standalone `{{project_brief}}` line collapses cleanly",
  substituteVariables(
    "Intro line.\n\n{{project_brief}}\n\nClosing line.",
    vars,
  ),
  "Intro line.\n\nClosing line.",
);

assertEq(
  "filled variable still substitutes correctly",
  substituteVariables("Hello {{client_name}}", vars),
  "Hello Acme",
);

assertEq(
  "`{{project_name}} is {{project_location}}.` collapses when location empty",
  substituteVariables("{{project_name}} is {{project_location}}.", vars).trim(),
  "",
);

assertEq(
  "`{{project_name}} is located in {{project_location}}.` collapses when location empty",
  substituteVariables(
    "{{project_name}} is located in {{project_location}}.",
    vars,
  ).trim(),
  "",
);

assertEq(
  "bold subject `**{{project_name}}** is located in {{project_location}}.` collapses too",
  substituteVariables(
    "**{{project_name}}** is located in {{project_location}}.",
    vars,
  ).trim(),
  "",
);

assertEq(
  "longer sentences with real predicates are preserved",
  substituteVariables(
    "{{project_name}} is a residential renovation we look forward to.",
    vars,
  ),
  "Lighthouse is a residential renovation we look forward to.",
);

if (failed > 0) {
  console.error(`\n${failed} check(s) failed.`);
  process.exit(1);
}
console.log("\nAll proposal substitution checks passed.");
