#!/usr/bin/env node
/**
 * API-07: nothing about the provider credentials may reach the browser.
 * Run after `next build`. Scans every client asset in .next/static for the env var name and the
 * provider host (either would mean server code leaked into a client chunk), and for the key
 * itself when one is set in the environment.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = new URL("../.next/static", import.meta.url);
const needles = ["GROQ_API_KEY", "api.groq.com"];
if (process.env.GROQ_API_KEY) needles.push(process.env.GROQ_API_KEY);

function* files(dir) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) yield* files(path);
    else yield path;
  }
}

const dir = fileURLToPath(root);
try {
  statSync(dir);
} catch {
  console.error("No .next/static found. Run `npm run build` first.");
  process.exit(2);
}

let scanned = 0;
const leaks = [];
for (const file of files(dir)) {
  if (!/\.(js|css|html|json|txt|map)$/.test(file)) continue;
  scanned += 1;
  const text = readFileSync(file, "utf8");
  for (const needle of needles) {
    if (text.includes(needle)) leaks.push(`${file}: contains ${needle === process.env.GROQ_API_KEY ? "the API key" : needle}`);
  }
}

if (leaks.length > 0) {
  console.error(`Client bundle leak:\n${leaks.join("\n")}`);
  process.exit(1);
}
console.log(`Bundle check passed: ${scanned} client files, no provider credentials or host.`);
