const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { COLUMNS, buildSql } = require('../query-engine.js');
const base = path.join(__dirname, '..');
const catalogContext = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(base, 'queries.js'), 'utf8'), catalogContext);
const catalog = catalogContext.window.QUERY_CATALOG;
const config = { projectId: 'my-project', dataset: 'analytics', tableName: 'domain_data', positionBase: '1', columns: COLUMNS };

test('all 13 reports compile to single SELECTs without absent schema fields', () => {
  assert.equal(catalog.length, 13);
  for (const report of catalog) {
    const sql = buildSql(report, config);
    assert.match(sql, /^WITH source_data AS/);
    assert.equal(sql.split(';').length, 2);
    assert.doesNotMatch(sql, /\{\{|\bDECLARE\b|\bCREATE\b|\bsearch_type\b|\burl\b|\bis_anonymized_query\b/);
    assert.match(sql, /`my-project\.analytics\.domain_data`/);
  }
});

test('column selection preserves requested order and validates empty/unknown fields', () => {
  const sql = buildSql(catalog[0], { ...config, columns: ['domain', 'date', 'network_id'] });
  assert.match(sql, /SELECT `domain`, `date`, `network_id` FROM source_data/);
  assert.throws(() => buildSql(catalog[0], { ...config, columns: [] }), /at least one/);
  assert.throws(() => buildSql(catalog[0], { ...config, columns: ['url'] }), /Unknown/);
});

test('source filters use inclusive dates and independently target visitor/site countries', () => {
  const sql = buildSql(catalog[1], { ...config, startDate: '2024-02-01', endDate: '2024-02-29', countryFilter: 'usa', siteCountryFilter: 'CA', domainFilter: 'x"\\\n OR TRUE --' });
  assert.match(sql, />= DATE '2024-02-01'/);
  assert.match(sql, /<= DATE '2024-02-29'/);
  assert.ok(sql.includes('LOWER(CAST(country AS STRING)) = LOWER("usa")'));
  assert.ok(sql.includes('LOWER(CAST(site_country AS STRING)) = LOWER("CA")'));
  assert.ok(sql.includes(JSON.stringify('x"\\\n OR TRUE --')));
});

test('invalid source identifiers, calendar dates, and reversed ranges are rejected', () => {
  for (const patch of [{ tableName: 'x` UNION SELECT 1' }, { startDate: '2024-02-30' }, { startDate: '2024-03-01', endDate: '2024-02-01' }, { positionBase: '2' }]) {
    assert.throws(() => buildSql(catalog[0], { ...config, ...patch }));
  }
});

test('position normalization uses weighted sums with a matching non-null denominator', () => {
  const report = catalog.find((item) => item.id === 'q09');
  assert.match(buildSql(report, config), /\(position - 1\) \* impressions/);
  assert.match(buildSql(report, { ...config, positionBase: '0' }), /\(position - 0\) \* impressions/);
  assert.match(buildSql(report, config), /SUM\(sum_position\), SUM\(position_impressions\)/);
  // Known 1-based fixture: 10 impressions at position 2 and 30 at 6 => 5.
  const rows = [[2, 10], [6, 30], [null, 100]];
  const available = rows.filter(([position]) => position !== null);
  const position = available.reduce((sum, [p, n]) => sum + (p - 1) * n, 0) / available.reduce((sum, [, n]) => sum + n, 0) + 1;
  assert.equal(position, 5);
});

function browser(responses) {
  const nodes = new Map();
  function node(id) {
    if (!nodes.has(id)) nodes.set(id, { value: '', innerHTML: '', textContent: '', disabled: false, hidden: false, addEventListener() {}, scrollIntoView() {}, classList: { toggle() {} } });
    return nodes.get(id);
  }
  for (const [key, value] of Object.entries({ ...config, clientId: 'test.apps.googleusercontent.com', location: 'EU' })) if (typeof value === 'string') node(key).value = value;
  const checkboxes = COLUMNS.map((value) => ({ value, checked: true }));
  const calls = [];
  const context = { URL, Blob, console, navigator: { clipboard: { writeText: async () => {} } },
    document: { querySelector: (selector) => node(selector.slice(1)), getElementById: node,
      querySelectorAll: (selector) => selector.includes('outputColumn') ? checkboxes : [], createElement: () => ({ click() {} }) },
    localStorage: { getItem: () => null, setItem() {} }, clearTimeout() {}, setTimeout(callback) { callback(); return 1; },
    fetch: async (url, options) => { calls.push({ url, options }); const result = responses.shift(); if (!result) throw new Error('Unexpected request'); return { status: result.status || 200, ok: (result.status || 200) < 400, json: async () => result.body }; } };
  context.window = context;
  vm.createContext(context);
  for (const file of ['query-engine.js', 'queries.js', 'app.js']) vm.runInContext(fs.readFileSync(path.join(base, file), 'utf8'), context);
  vm.runInContext('state.token = "test-token"', context);
  return { context, calls, node };
}

test('browser execution polls, downloads later pages, and renders selected fields', async () => {
  const { context, calls, node } = browser([
    { body: { jobComplete: false, jobReference: { jobId: 'job1' } } },
    { body: { jobComplete: true, jobReference: { jobId: 'job1' }, schema: { fields: [{ name: 'domain' }] }, rows: [{ f: [{ v: 'one.test' }] }], pageToken: 'next' } },
    { body: { rows: [{ f: [{ v: 'two.test' }] }] } },
  ]);
  await vm.runInContext('runQuery()', context);
  assert.equal(calls.length, 3);
  assert.match(calls[1].url, /location=EU/);
  assert.match(calls[2].url, /pageToken=next/);
  assert.match(node('resultsTable').innerHTML, /one.test/);
  assert.match(node('resultsTable').innerHTML, /two.test/);
  assert.equal(node('downloadFullButton').disabled, false);
  assert.equal(JSON.parse(calls[0].options.body).useLegacySql, false);
});

test('dry run submits the same generated SQL without executing a query', async () => {
  const { context, calls, node } = browser([{ body: { statistics: { totalBytesProcessed: '1024' } } }]);
  await vm.runInContext('dryRun()', context);
  const request = JSON.parse(calls[0].options.body);
  assert.equal(request.configuration.dryRun, true);
  assert.match(request.configuration.query.query, /^WITH source_data/);
  assert.equal(node('resultStatus').textContent, 'Cost estimate ready');
});

test('BigQuery errors and expired authorization are visible and restore controls', async () => {
  for (const response of [{ status: 401, body: {} }, { body: { errors: [{ message: 'Column missing' }] } }]) {
    const { context, node } = browser([response]);
    await vm.runInContext('runQuery()', context);
    assert.equal(node('resultStatus').textContent, 'Query failed');
    assert.equal(node('runQueryButton').disabled, false);
    assert.equal(node('downloadFullButton').disabled, true);
  }
});
