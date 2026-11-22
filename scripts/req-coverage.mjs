#!/usr/bin/env node
/**
 * Requirement coverage: which tests prove which requirement, and did they pass?
 *
 * Reads requirement IDs from docs/SPEC.md and test results from Vitest and/or Playwright JSON
 * reports, then prints a Markdown table. Exits 1 if a requirement in scope has no passing test,
 * or if any test tagged with it failed.
 *
 *   npx vitest run --reporter=json --outputFile=reports/vitest.json
 *   node scripts/req-coverage.mjs reports/vitest.json [reports/playwright.json] [--only=INC,EXT]
 */
import { readFileSync } from "node:fs";

const args = process.argv.slice(2);
const only = args.find((a) => a.startsWith("--only="))?.slice("--only=".length).split(",");
const reports = args.filter((a) => !a.startsWith("--"));
if (reports.length === 0) {
  console.error("usage: req-coverage.mjs <report.json>... [--only=PREFIX,...|ID,...]");
  process.exit(2);
}

const ID = /\b([A-Z]{2,4}-\d{2})\b/g;
const spec = readFileSync(new URL("../docs/SPEC.md", import.meta.url), "utf8");
const requirements = [...new Set([...spec.matchAll(/^\| ([A-Z]{2,4}-\d{2}) \|/gm)].map((m) => m[1]))];
const inScope = requirements.filter(
  (id) => !only || only.some((o) => id === o || id.startsWith(`${o}-`)),
);

/** @type {{ title: string, passed: boolean, file: string }[]} */
const tests = [];

function collectPlaywright(suite, file) {
  for (const spec of suite.specs ?? []) {
    const passed = spec.tests.every((t) => t.results.every((r) => r.status === "passed" || r.status === "skipped") && t.results.length > 0);
    tests.push({ title: spec.title, passed: spec.ok && passed, file: spec.file ?? file });
  }
  for (const child of suite.suites ?? []) collectPlaywright(child, suite.file ?? file);
}

for (const path of reports) {
  const report = JSON.parse(readFileSync(path, "utf8"));
  if (Array.isArray(report.testResults)) {
    for (const file of report.testResults) {
      for (const t of file.assertionResults) {
        if (t.status === "pending" || t.status === "skipped") continue;
        tests.push({
          title: t.fullName ?? t.title,
          passed: t.status === "passed",
          file: file.name.replace(/\\/g, "/").replace(/^.*\/(tests|e2e)\//, "$1/"),
        });
      }
    }
  } else if (Array.isArray(report.suites)) {
    for (const suite of report.suites) collectPlaywright(suite, suite.file);
  }
}

let ok = true;
const rows = [];
for (const id of inScope) {
  const tagged = tests.filter((t) => [...t.title.matchAll(ID)].some((m) => m[1] === id));
  const failed = tagged.filter((t) => !t.passed);
  const files = [...new Set(tagged.map((t) => t.file))].join(", ");
  let status = "PASS";
  if (tagged.length === 0) status = "NO TEST";
  else if (failed.length > 0) status = "FAIL";
  if (status !== "PASS") ok = false;
  rows.push(`| ${id} | ${tagged.length - failed.length}/${tagged.length} | ${status} | ${files} |`);
}

console.log("| Requirement | Passing tests | Status | Test files |");
console.log("|-------------|---------------|--------|------------|");
console.log(rows.join("\n"));
console.log(`\n${tests.length} tests read; ${inScope.length} requirements in scope.`);
process.exit(ok ? 0 : 1);
