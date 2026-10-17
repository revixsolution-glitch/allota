// Fails the build if code could mix companies' data or leak a secret.
// Run automatically before `next build` (see package.json "build").
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = "src";
const SKIP = new Set(["generated", "node_modules"]);

const RULES = [
  {
    name: "fail-open company filter (empty filter returns EVERY company's rows) — use scopeToCompany()/scopeViaRelation() from @/lib/auth",
    test: /\?\s*\{\s*companyId\s*:[^}]*\}\s*:\s*\{\s*\}/,
  },
  {
    name: "fail-open company filter through a relation — use scopeViaRelation() from @/lib/auth",
    test: /\?\s*\{\s*\w+\s*:\s*\{\s*companyId[^}]*\}\s*\}\s*:\s*\{\s*\}/,
  },
  { name: "hardcoded Meta access token", test: /EAA[A-Za-z0-9]{40,}/ },
  { name: "hardcoded Google/Gemini API key", test: /\bAQ\.[A-Za-z0-9_-]{30,}|\bAIza[A-Za-z0-9_-]{30,}/ },
  { name: "hardcoded 32-char app secret", test: /(?:secret|Secret)\w*\s*[:=]\s*["'][a-f0-9]{32}["']/ },
];

function* walk(dir) {
  for (const entry of readdirSync(dir)) {
    if (SKIP.has(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) yield* walk(full);
    else if (/\.(ts|tsx|js|jsx|mjs)$/.test(entry)) yield full;
  }
}

const problems = [];
for (const file of walk(ROOT)) {
  const lines = readFileSync(file, "utf8").split("\n");
  lines.forEach((line, i) => {
    for (const rule of RULES) {
      if (rule.test.test(line)) problems.push(`${file}:${i + 1}  ${rule.name}`);
    }
  });
}

if (problems.length) {
  console.error("\nTenant-safety check FAILED:\n" + problems.map((p) => "  - " + p).join("\n") + "\n");
  process.exit(1);
}
console.log("Tenant-safety check passed: no fail-open company filters or hardcoded secrets.");
