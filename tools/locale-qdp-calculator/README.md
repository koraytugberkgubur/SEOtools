# Locale QDP Calculator

An explainable, browser-based decision tool derived from the **Locale Decision Tree SOP**. It asks four short evidence questions, then recommends whether a locale should receive a separate page, remain inside a parent page, defer pending evidence, or lead with a city instead of a country.

## Run locally

```bash
npm start
```

Open `http://localhost:4173`. No install or build step is required.

## Decision model

The calculator scores the SOP's four Query Deserves a Page signals:

1. **Independent locale search demand:** calculated from the candidate's share of combined query demand.
2. **Different locale entities:** manually confirmed because URLs and demand cannot establish regulators, currencies, brands, units, or vocabulary reliably.
3. **Location-specific SERP evidence:** records informational, commercial, or mixed intent and passes with one strong localization signal (country domains, local PAA sources, or a local pack) or two supporting signals (local brands, localized snippets, local entities, or different SERP composition).
4. **A repeatable locale query pattern:** passes when at least three representative queries are supplied.

The simple interface uses fixed, visible thresholds: 20% candidate demand share and three representative queries. The SERP evidence rule is shown directly in Step 2: one strong signal or two supporting signals.

It then applies the ordered scenario rules from the SOP:

- **New market / missing evidence:** defer; use the closest existing version for one quarter.
- **Small neighboring market:** when population is small, language is nearly identical, and the neighbor already serves the SERP, do not create a separate page or domain.
- **City vs. country:** when the city query wins and the city is the heaviest term, lead with the city.
- **Shared language / standard evaluation:** create a separate locale page only when at least 3 of 4 metrics pass, including independent demand and different entities.

### Implementation assumption

The SOP says a regional variant must pass at least three metrics, “most importantly” independent demand and different entities. This tool interprets that phrase as a deterministic requirement: a split needs a score of 3+ **and** both priority metrics. This makes the calculation repeatable and conservative. Adjust `qualifies` in `decision-engine.js` if your governance treats those two signals as advisory instead.

## Test

```bash
npm test
```

## Privacy

All calculations happen in the browser. No form data is sent or stored.

## License

MIT
