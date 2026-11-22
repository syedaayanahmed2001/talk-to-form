import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/** Checks on the repository itself: docs, CI and hygiene requirements. */

const root = join(__dirname, "..");
const read = (path: string) => readFileSync(join(root, path), "utf8");

const spec = read("docs/SPEC.md");
const requirementIds = [...new Set([...spec.matchAll(/^\| ([A-Z]{2,4}-\d{2}) \|/gm)].map((m) => m[1]))];

function testSources(): string {
  const files: string[] = [];
  for (const dir of ["tests", "e2e"]) {
    for (const name of readdirSync(join(root, dir))) {
      if (/\.(test|spec)\.tsx?$/.test(name)) files.push(read(`${dir}/${name}`));
    }
  }
  return files.join("\n");
}

describe("repository", () => {
  it("[QA-01] every requirement in docs/SPEC.md is named in at least one test", () => {
    expect(requirementIds.length).toBe(38);
    const sources = testSources();
    // Only count IDs inside test titles: "[EXT-04]" style tags.
    const missing = requirementIds.filter((id) => !sources.includes(`[${id}]`));
    expect(missing).toEqual([]);
  });

  it("[QA-02] CI runs install, typecheck, lint, test, build on Node 22 without secrets", () => {
    const ci = read(".github/workflows/ci.yml");
    expect(ci).toMatch(/node-version: 22/);
    for (const step of ["npm ci", "npm run typecheck", "npm run lint", "npm run test:req", "npm run build", "npm run check:bundle"]) {
      expect(ci, step).toContain(`run: ${step}`);
    }
    expect(ci).not.toMatch(/secrets\./);
    const pkg = JSON.parse(read("package.json"));
    expect(pkg.scripts["test:req"]).toContain("req-coverage.mjs");
  });

  it("[QA-02] the lockfile carries the optional wasm peers Linux needs", () => {
    const lock = read("package-lock.json");
    if (lock.includes('"node_modules/@rolldown/binding-wasm32-wasi"')) {
      expect(lock).toContain('"node_modules/@emnapi/core"');
      expect(lock).toContain('"node_modules/@emnapi/runtime"');
    }
  });

  it("[QA-03] the Playwright smoke test runs as an optional CI job", () => {
    const ci = read(".github/workflows/ci.yml");
    expect(ci).toMatch(/e2e:[\s\S]*continue-on-error: true[\s\S]*playwright install --with-deps chromium/);
    expect(existsSync(join(root, "e2e/demo-flow.spec.ts"))).toBe(true);
  });

  it("[QA-04] the README covers the problem, pipeline, setup, deploy, decisions, limits and licence", () => {
    const readme = read("README.md");
    expect(readme).toContain(
      "[![CI](https://github.com/syedaayanahmed2001/talk-to-form/actions/workflows/ci.yml/badge.svg)](https://github.com/syedaayanahmed2001/talk-to-form/actions/workflows/ci.yml)",
    );
    expect(readme).toContain("<!-- demo gif / live link goes here -->");
    expect(readme).toMatch(/```mermaid[\s\S]*Whisper[\s\S]*Transcript[\s\S]*JSON schema[\s\S]*repair[\s\S]*approves[\s\S]*Final record[\s\S]*```/);
    for (const heading of [
      "## How it works",
      "## Run it locally",
      "## Deploy to Vercel",
      "## Design decisions",
      "## How this was built: spec first",
      "## Limitations",
      "## License",
    ]) {
      expect(readme, heading).toContain(heading);
    }
    expect(readme).toContain("Without an API key");
    expect(readme).toContain("GROQ_API_KEY");
    expect(readme).toMatch(/\*\*Schema first\.\*\*/);
    expect(readme).toMatch(/\*\*A human approves every field/);
    expect(readme).toMatch(/\*\*Demo mode/);
    expect(readme).toMatch(/MIT .*Syed Aayan Ahmed/);
    expect(read("LICENSE")).toMatch(/MIT License[\s\S]*Copyright \(c\) 2026 Syed Aayan Ahmed/);
  });

  it("[QA-05] docs/SPEC.md has every requirement and all four phases, and the README links it", () => {
    for (const phase of ["Phase 1", "Phase 2", "Phase 3", "Phase 4"]) expect(spec).toContain(`### ${phase}`);
    for (const prefix of ["INC", "EXT", "API", "DEMO", "UI", "QA"]) {
      expect(requirementIds.some((id) => id.startsWith(`${prefix}-`)), prefix).toBe(true);
    }
    expect(read("README.md")).toContain("[docs/SPEC.md](docs/SPEC.md)");
  });

  it("[QA-06] secrets and the planning workspace are ignored and untracked", () => {
    const gitignore = read(".gitignore");
    expect(gitignore).toMatch(/^\.env\*$/m);
    expect(gitignore).toMatch(/^!\.env\.example$/m);
    expect(gitignore).toMatch(/^\.planning\/$/m);
    expect(read(".env.example")).toMatch(/^GROQ_API_KEY=$/m);
    expect(read(".env.example")).not.toMatch(/gsk_/);

    let tracked: string[] = [];
    try {
      tracked = execFileSync("git", ["ls-files"], { cwd: root, encoding: "utf8" }).split("\n");
    } catch {
      return; // not a git checkout (e.g. a tarball); the ignore rules above still hold
    }
    expect(tracked.filter((f) => /(^|\/)\.env/.test(f))).toEqual([".env.example"]);
    expect(tracked.filter((f) => f.startsWith(".planning/"))).toEqual([]);
  });
});
