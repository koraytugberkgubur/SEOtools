const test = require('node:test');
const assert = require('node:assert/strict');
const { calculate } = require('../decision-engine');

const base = { scenario: 'shared-language', hasReliableData: true, populatedQueries: 3, complete: true, candidateShare: .35, intent: 'both', localizedEvidence: ['country-specific domains rank'], metrics: { demand: true, entities: true, localizedSerp: true, pattern: true } };
test('splits when three priority-qualified metrics pass', () => assert.equal(calculate(base).status, 'split'));
test('merges when priority demand signal fails', () => assert.equal(calculate({ ...base, metrics: { ...base.metrics, demand: false } }).status, 'merge'));
test('merges when localized SERP evidence is absent but explains it', () => {
  const result=calculate({ ...base, localizedEvidence:[], metrics:{...base.metrics,localizedSerp:false,pattern:false} });
  assert.equal(result.status,'merge'); assert.match(result.rationale.join(' '),/one strong signal or two supporting/);
});
test('defers a new market without reliable data', () => assert.equal(calculate({ ...base, scenario: 'new-market', hasReliableData: false }).status, 'defer'));
test('small-neighbor override prevents a separate domain', () => assert.equal(calculate({ ...base, scenario: 'small-neighbor', smallPopulation: true, nearlyIdenticalLanguage: true, neighborServesSerp: true }).status, 'merge'));
test('city branch leads with the city', () => assert.equal(calculate({ ...base, scenario: 'city-country', cityOutranksCountry: true, cityIsHeaviestTerm: true }).status, 'city'));
test('requires all four evidence questions before deciding', () => assert.equal(calculate({...base,complete:false}).status,'incomplete'));
