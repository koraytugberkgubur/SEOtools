import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync(new URL("../industry-config.js", import.meta.url), "utf8");
const context = vm.createContext({ window: {} });
vm.runInContext(source, context);

const config = context.window.INDUSTRY_CONFIG;
assert.ok(config, "industry config should be exposed on window");

const scopeIds = config.pageScopes.map((scope) => scope.id);
assert.equal(new Set(scopeIds).size, scopeIds.length, "page-scope ids must be unique");

function matches(scopeId, url) {
  const scope = config.pageScopes.find((item) => item.id === scopeId);
  assert.ok(scope, `missing scope: ${scopeId}`);
  return scope.pattern ? new RegExp(`^https?://[^/]+(?:${scope.pattern})`, "i").test(url) : true;
}

const samples = {
  pollen: "https://allergiecheck.de/pages/birkenpollenallergie",
  food: "https://allergiecheck.de/pages/lebensmittelallergie",
  symptom: "https://allergiecheck.de/pages/allergisches-asthma-atemnot-und-atembeschwerden",
  treatment: "https://allergiecheck.de/pages/hyposensibilisierung-tabletten",
  cityDoctor: "https://allergiecheck.de/pages/allergologische-facharzte-und-um-hannover",
  doctorFinder: "https://allergiecheck.de/pages/allergologensuche",
  genericService: "https://allergiecheck.de/pages/service",
};

assert.ok(matches("allergy-types", samples.pollen));
assert.ok(matches("allergy-types", samples.food));
assert.ok(matches("symptoms", samples.symptom));
assert.ok(matches("tests-treatment", samples.treatment));
assert.ok(matches("cities", samples.cityDoctor));
assert.ok(matches("doctors", samples.cityDoctor));
assert.ok(matches("doctors", samples.doctorFinder));
assert.equal(matches("allergy-types", samples.genericService), false);
assert.equal(matches("cities", samples.genericService), false);
assert.equal(matches("doctors", samples.genericService), false);

for (const [target, presets] of Object.entries(config.filterPresets)) {
  const ids = presets.map((preset) => preset.id);
  assert.equal(new Set(ids).size, ids.length, `${target} preset ids must be unique`);
  for (const preset of presets) {
    if (preset.mode === "regex") assert.doesNotThrow(() => new RegExp(preset.value, "i"), `${preset.id} should compile`);
  }
}

console.log(`Verified ${config.pageScopes.length} page groups and ${config.filterPresets.page.length + config.filterPresets.query.length} quick filters.`);
