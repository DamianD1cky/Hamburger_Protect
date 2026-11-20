// Style ratchet: global style debt may only shrink.
// Scans styles.css plus styles/*.css (post-split layout) and fails when any
// tracked metric exceeds scripts/style-ratchet-baseline.json. When a metric
// improves, lower the baseline in the same change — never raise it.
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const baseline = JSON.parse(
  readFileSync(join(root, "scripts/style-ratchet-baseline.json"), "utf8"),
);

const files = [join(root, "styles.css")];
const splitDir = join(root, "styles");
if (existsSync(splitDir)) {
  for (const name of readdirSync(splitDir).sort()) {
    if (name.endsWith(".css")) files.push(join(splitDir, name));
  }
}
const css = files.map((file) => readFileSync(file, "utf8")).join("\n");

const metrics = {
  important: (css.match(/!important/g) ?? []).length,
  distinctHex: new Set(
    [...css.matchAll(/#[0-9a-fA-F]{3,8}\b/g)].map((m) => m[0].toLowerCase()),
  ).size,
  mediaWidths: [
    ...new Set(
      [...css.matchAll(/@media[^{]*\((?:max|min)-width:\s*([\d.]+)px/g)].map(
        (m) => m[1],
      ),
    ),
  ].sort((a, b) => Number(a) - Number(b)),
  fractionalFontSizes: (css.match(/font-size:\s*\d+\.5px/g) ?? []).length,
};

let failed = false;
const check = (label, actual, limit) => {
  const ok = actual <= limit;
  console.log(`${ok ? "ok  " : "FAIL"} ${label}: ${actual} (baseline ${limit})`);
  if (!ok) failed = true;
};
check("!important occurrences", metrics.important, baseline.important);
check("distinct hex colours", metrics.distinctHex, baseline.distinctHex);
check(
  "fractional font sizes",
  metrics.fractionalFontSizes,
  baseline.fractionalFontSizes,
);
const extraWidths = metrics.mediaWidths.filter(
  (width) => !baseline.mediaWidths.includes(width),
);
console.log(
  `${extraWidths.length ? "FAIL" : "ok  "} media widths: ${metrics.mediaWidths.join(", ")}` +
    (extraWidths.length ? ` (new: ${extraWidths.join(", ")})` : ""),
);
if (extraWidths.length) failed = true;

if (failed) {
  console.error(
    "\nStyle ratchet failed. Fix the new debt, or — only when a metric " +
      "improved — lower scripts/style-ratchet-baseline.json. Never raise it.",
  );
  process.exit(1);
}
console.log("\nStyle ratchet passed. Baselines may only shrink from here.");
