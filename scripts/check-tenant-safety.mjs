// Fails the build if code could mix companies' data or leak a secret.
// Run automatically before `next build` (see package.json "build").
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = "src";
const SKIP = new Set(["generated", "node_modules"]);

// Files allowed to break a specific rule. Keep this list short and justified.
//  - sync-drive: the Kesrox-only Google Drive call integration. It returns early for every
//    other company, so its name-based lookups only ever run for Kesrox. TODO: replace with
//    a per-company Drive/rep configuration, then remove this exception.
const ALLOW_NAME_LOOKUPS = new Set([
  "src/app/api/telephony/sync-drive/route.ts",
  "src/app/api/whatsapp-companion/incoming/route.ts",
]);

// rawPrisma skips secret encryption/decryption, so it is only for these files.
const ALLOW_RAW_PRISMA = new Set([
  "src/lib/prisma.ts",
  "src/app/api/super-admin/encrypt-secrets/route.ts",
  "src/lib/secret-migration.ts",
]);

const ALLOW_CLEANUP = new Set(["src/lib/db-sync.ts"]);

const RULES = [
  {
    name: "fail-open company filter (empty filter returns EVERY company's rows) — use scopeToCompany()/scopeViaRelation() from @/lib/auth",
    test: /\?\s*\{\s*companyId\s*:[^}]*\}\s*:\s*\{\s*\}/,
  },
  {
    name: "fail-open company filter through a relation — use scopeViaRelation() from @/lib/auth",
    test: /\?\s*\{\s*\w+\s*:\s*\{\s*companyId[^}]*\}\s*\}\s*:\s*\{\s*\}/,
  },
  {
    name: "query special-cases one customer by name (e.g. contains \"Savi\"/\"Kesrox\") — every company would see that customer's data",
    test: /contains:\s*["'](Savi|Kesrox)/i,
    allow: ALLOW_NAME_LOOKUPS,
  },
  {
    name: "rawPrisma used outside the secrets migration — it bypasses encryption of company API keys; use prisma",
    test: /\brawPrisma\b/,
    allow: ALLOW_RAW_PRISMA,
  },
  { name: "hardcoded Meta access token", test: /EAA[A-Za-z0-9]{40,}/ },
  { name: "hardcoded Google/Gemini API key", test: /\bAQ\.[A-Za-z0-9_-]{30,}|\bAIza[A-Za-z0-9_-]{30,}/ },
  { name: "hardcoded 32-char app secret", test: /(?:secret|Secret)\w*\s*[:=]\s*["'][a-f0-9]{32}["']/ },
  { name: "shared test whatsapp auth directory leaked into code", test: /whatsapp_auth_test/ },
  { name: "hardcoded test whatsapp number", test: /9996589217|8708289217/, allow: ALLOW_CLEANUP },
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
      if (rule.allow && rule.allow.has(file.replaceAll("\\", "/"))) continue;
      if (rule.test.test(line)) problems.push(`${file}:${i + 1}  ${rule.name}`);
    }
  });
}

if (problems.length) {
  console.error("\nTenant-safety check FAILED:\n" + problems.map((p) => "  - " + p).join("\n") + "\n");
  process.exit(1);
}
console.log("Tenant-safety check passed: no fail-open company filters or hardcoded secrets.");
