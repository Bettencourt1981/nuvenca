// Fails when the translation files don't have exactly the same keys.
import { readFileSync } from "node:fs";

const load = (locale) => JSON.parse(readFileSync(new URL(`../src/messages/${locale}.json`, import.meta.url), "utf8"));

function keys(object, prefix = "") {
  return Object.entries(object).flatMap(([key, value]) =>
    value && typeof value === "object" ? keys(value, `${prefix}${key}.`) : [`${prefix}${key}`],
  );
}

const [reference, ...others] = ["en", "pt"];
const expected = new Set(keys(load(reference)));
let failed = false;
for (const locale of others) {
  const actual = new Set(keys(load(locale)));
  const missing = [...expected].filter((key) => !actual.has(key));
  const extra = [...actual].filter((key) => !expected.has(key));
  if (missing.length || extra.length) {
    failed = true;
    console.error(`${locale}.json is out of sync with ${reference}.json`);
    missing.forEach((key) => console.error(`  missing: ${key}`));
    extra.forEach((key) => console.error(`  extra:   ${key}`));
  }
}
if (failed) process.exit(1);
console.log("Translations are in sync.");
