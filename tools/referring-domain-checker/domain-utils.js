(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.DomainUtils = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const DOMAIN_HEADERS = ['referring domain', 'referring domains', 'domain', 'source domain', 'source url', 'referring page url', 'referring page'];

  function normalizeDomain(value) {
    if (value == null) return '';
    let input = String(value).trim().toLowerCase();
    if (!input) return '';
    input = input.replace(/^['"]|['"]$/g, '').trim();
    try {
      const url = new URL(/^https?:\/\//i.test(input) ? input : `http://${input}`);
      return url.hostname.replace(/^www\./, '').replace(/\.$/, '');
    } catch {
      return input.split(/[/?#\s]/)[0].replace(/^www\./, '').replace(/[^a-z0-9._-]/g, '');
    }
  }

  function parseDelimitedLine(line, delimiter) {
    const cells = [];
    let cell = '';
    let quoted = false;
    for (let i = 0; i < line.length; i += 1) {
      const char = line[i];
      if (char === '"' && line[i + 1] === '"' && quoted) { cell += '"'; i += 1; }
      else if (char === '"') quoted = !quoted;
      else if (char === delimiter && !quoted) { cells.push(cell); cell = ''; }
      else cell += char;
    }
    cells.push(cell);
    return cells;
  }

  function parseDomainText(text) {
    const lines = String(text || '').replace(/^\uFEFF/, '').split(/\r?\n/).filter(line => line.trim());
    if (!lines.length) return [];
    const delimiter = lines[0].includes('\t') ? '\t' : ',';
    const first = parseDelimitedLine(lines[0], delimiter);
    const headers = first.map(cell => cell.trim().toLowerCase());
    let index = headers.findIndex(header => DOMAIN_HEADERS.includes(header));
    let start = 1;
    if (index < 0) { index = 0; start = 0; }
    return [...new Set(lines.slice(start).map(line => normalizeDomain(parseDelimitedLine(line, delimiter)[index])).filter(domain => domain.includes('.') && !domain.includes('..')))];
  }

  function compareDomains(candidates, known) {
    const inventory = new Set(known.map(normalizeDomain));
    return [...new Set(candidates.map(normalizeDomain).filter(Boolean))].map(domain => ({ domain, exists: inventory.has(domain) }));
  }

  return { normalizeDomain, parseDomainText, compareDomains };
});
