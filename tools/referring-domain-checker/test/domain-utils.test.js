const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeDomain, parseDomainText, compareDomains } = require('../domain-utils');

test('normalizes URLs and common hostname variants', () => {
  assert.equal(normalizeDomain('https://www.Example.com/path?q=1'), 'example.com');
  assert.equal(normalizeDomain('sub.example.com/hello'), 'sub.example.com');
});

test('parses Semrush-style CSV and removes duplicates', () => {
  const csv = 'Referring Domain,Backlinks\nexample.com,3\n"www.test.org",2\nexample.com,1';
  assert.deepEqual(parseDomainText(csv), ['example.com', 'test.org']);
});

test('parses Ahrefs-style source URL column', () => {
  const csv = 'Referring page URL\tDomain Rating\nhttps://news.example.net/story\t72';
  assert.deepEqual(parseDomainText(csv), ['news.example.net']);
});

test('compares a candidate list with inventory', () => {
  assert.deepEqual(compareDomains(['www.example.com', 'new.co'], ['example.com']), [
    { domain:'example.com', exists:true }, { domain:'new.co', exists:false }
  ]);
});
