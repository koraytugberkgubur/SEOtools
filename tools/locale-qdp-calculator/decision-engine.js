(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.QDP = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const metricLabels = { demand: 'Independent search demand', localizedSerp: 'Location-specific SERP evidence', entities: 'Different locale entities', pattern: 'Repeatable query pattern' };
  function serpEvidence(input) {
    const intent = input.intent === 'both' ? 'mixed informational and commercial' : input.intent;
    const evidence = input.localizedEvidence?.length ? input.localizedEvidence.join('; ') : 'no location-specific SERP signals were selected';
    return `The query has ${intent || 'unclassified'} intent; observed SERP evidence: ${evidence}.`;
  }
  function calculate(input) {
    const passed = Object.keys(metricLabels).filter(key => Boolean(input.metrics?.[key]));
    const score = passed.length;
    const result = { score, maxScore: 4, evidence: passed.map(key => metricLabels[key]), branch: input.scenario, status: '', title: '', action: '', rationale: [], safeguards: [] };
    if (!input.hasReliableData || input.scenario === 'new-market') return Object.assign(result, { status: 'defer', title: 'Defer the split', action: 'Launch under the closest existing version, collect market-level demand, crawl, click, and ranking data for one quarter, then re-run the assessment.', rationale: ['QDP cannot be scored reliably without market-level evidence.', 'A provisional parent version avoids committing crawl budget before demand is proven.'] });
    if (!input.populatedQueries || input.complete === false) return Object.assign(result, { status: 'incomplete', title: 'Answer the four questions', action: 'Complete the demand, localized SERP, entity, and query-pattern inputs to get a QDP recommendation.', rationale: ['QDP needs all four signals before it can make a defensible decision.'] });
    if (input.scenario === 'small-neighbor' && input.smallPopulation && input.nearlyIdenticalLanguage && input.neighborServesSerp) return Object.assign(result, { status: 'merge', title: 'Use the neighbor version', action: 'Do not open a separate page or domain. Represent meaningful local differences inside the neighbor page.', rationale: ['The market is small, the language delta is negligible, and the neighbor version already serves the SERP.', 'This ordered SOP branch overrides the numeric score.'] });
    if (input.scenario === 'city-country' && input.cityOutranksCountry && input.cityIsHeaviestTerm) return Object.assign(result, { status: 'city', title: 'Lead with the city', action: 'Make the city the primary entity in the title, H1, semantic triples, and anchors; keep the country as supporting context.', rationale: ['The city query carries the stronger demand signal.', 'The city is the heaviest query term, so it deserves the index.'] });
    const qualifies = score >= 3 && input.metrics.demand && input.metrics.entities;
    if (qualifies) return Object.assign(result, { status: 'split', title: 'Create a separate locale page', action: 'Build a region-specific page and align its locale signal across naming, URL, internal anchors, sitemap, canonicals, and reciprocal hreflang.', rationale: [`The candidate passes ${score} of 4 QDP metrics.`, `Candidate demand is ${(input.candidateShare * 100).toFixed(1)}% of combined demand.`, serpEvidence(input), 'Independent demand and different entities—the two priority signals—both pass.'], safeguards: ['Target a distinct query network, not cosmetic wording changes.', 'Monitor GSC query overlap for the first eight weeks.', 'Re-evaluate quarterly using crawl efficiency and click data.'] });
    return Object.assign(result, { status: 'merge', title: input.scenario === 'shared-language' ? 'Serve one universal language page' : 'Keep the locale below page level', action: 'Keep signals consolidated in the closest parent page. Cover the locale with headings, pricing tables, currency details, regional chips, tabs, or structured information cards.', rationale: [`The candidate passes ${score} of 4 QDP metrics; the SOP requires at least three.`, `Candidate demand is ${(input.candidateShare * 100).toFixed(1)}% of combined demand.`, serpEvidence(input), ...(input.metrics.demand ? [] : ['Independent locale demand does not reach the 20% threshold.']), ...(input.metrics.localizedSerp ? [] : ['Localized SERP evidence needs at least one strong signal or two supporting signals.']), ...(input.metrics.entities ? [] : ['Distinct local entities are not confirmed.'])] });
  }
  return { calculate, metricLabels };
});
