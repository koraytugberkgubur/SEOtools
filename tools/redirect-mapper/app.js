const $ = (id) => document.getElementById(id);
let crawl = { sources: [], targets: [], all: [], ignored: 0, malformed: [], columns: [] };
let latest = [];

const ALIASES = {
  url: ["url", "address", "page", "page url", "page_url", "landing page", "source url", "source_url", "original url", "internal url", "uri"],
  status: ["status", "status code", "status_code", "http status", "http status code", "response", "response code", "response_code", "http code", "statuscode"],
  title: ["title", "title 1", "title tag", "page title", "meta title"],
  h1: ["h1", "h1-1", "h1 1", "heading 1"],
  description: ["meta description", "description", "meta description 1"],
  content_type: ["content type", "mime type", "content-type", "contenttype"],
};

function normalizeHeader(value) { return value.replace(/^\ufeff/, "").trim().toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " "); }
function columnIndex(headers, name) {
  const aliases = ALIASES[name].map(normalizeHeader);
  const exact = headers.findIndex(header => aliases.includes(header));
  if (exact >= 0) return exact;
  if (name === "url") return headers.findIndex(header => /(^|\s)(url|uri|address)(\s|$)/.test(header));
  if (name === "status") return headers.findIndex(header => /(^|\s)(status|response)(\s|$)/.test(header));
  if (name === "title") return headers.findIndex(header => /(^|\s)title(\s|$)/.test(header));
  if (name === "h1") return headers.findIndex(header => /^h\s*1(?:\s|$)/.test(header));
  if (name === "description") return headers.findIndex(header => /(^|\s)description(\s|$)/.test(header));
  return -1;
}
function detectDelimiter(text) {
  const declared = text.match(/^\ufeff?sep=(.)\r?\n/i);
  if (declared) return declared[1];
  const counts = { ",": 0, ";": 0, "\t": 0 };
  for (const line of text.split(/\r?\n/).filter(Boolean).slice(0, 10)) {
    const lineCounts = { ",": 0, ";": 0, "\t": 0 }; let quoted = false;
    for (let i = 0; i < line.length; i++) {
      if (line[i] === '"' && line[i + 1] === '"') i++;
      else if (line[i] === '"') quoted = !quoted;
      else if (!quoted && Object.prototype.hasOwnProperty.call(lineCounts, line[i])) lineCounts[line[i]]++;
    }
    Object.keys(counts).forEach(delimiter => { counts[delimiter] = Math.max(counts[delimiter], lineCounts[delimiter]); });
  }
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
}
function csvRows(text) {
  const delimiter = detectDelimiter(text);
  const rows = []; let row = [], cell = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (char === '"') quoted = false;
      else cell += char;
    } else if (char === '"') quoted = true;
    else if (char === delimiter) { row.push(cell); cell = ""; }
    else if (char === "\n") { row.push(cell); if (row.some(Boolean)) rows.push(row); row = []; cell = ""; }
    else if (char !== "\r") cell += char;
  }
  if (cell || row.length) { row.push(cell); if (row.some(Boolean)) rows.push(row); }
  return rows;
}
function parseCrawl(text) {
  const rows = csvRows(text);
  if (rows.length < 2) throw new Error("The CSV has no data rows.");
  const headerRow = rows.slice(0, 20).findIndex(row => {
    const candidate = row.map(normalizeHeader);
    return columnIndex(candidate, "url") >= 0 && columnIndex(candidate, "status") >= 0;
  });
  const fallbackHeaders = rows[0].map(normalizeHeader).filter(Boolean);
  if (headerRow < 0) throw new Error(`Could not identify URL and status columns. Found: ${fallbackHeaders.slice(0, 6).join(", ") || "no headers"}.`);
  const headers = rows[headerRow].map(normalizeHeader);
  const indexes = Object.fromEntries(Object.keys(ALIASES).map(name => [name, columnIndex(headers, name)]));
  const pages = [], malformed = [];
  rows.slice(headerRow + 1).forEach((columns, offset) => {
    const rawUrl = (columns[indexes.url] || "").trim();
    const rawStatus = (columns[indexes.status] || "").trim();
    const status = Number.parseInt((rawStatus.match(/\b[1-5]\d\d\b/) || [""])[0], 10);
    if (!rawUrl) return;
    try {
      const parsed = new URL(rawUrl);
      if (!/^https?:$/.test(parsed.protocol) || !parsed.hostname) throw new Error("Not an absolute HTTP(S) URL");
      decodeURIComponent(parsed.pathname);
      if (!Number.isFinite(status)) return;
      pages.push({ url: rawUrl, status, title: indexes.title >= 0 ? (columns[indexes.title] || "").trim() : "", h1: indexes.h1 >= 0 ? (columns[indexes.h1] || "").trim() : "", description: indexes.description >= 0 ? (columns[indexes.description] || "").trim() : "", content_type: indexes.content_type >= 0 ? (columns[indexes.content_type] || "").trim() : "" });
    } catch (error) {
      malformed.push({ row: headerRow + offset + 2, url: rawUrl, status: rawStatus, reason: error instanceof URIError ? "Invalid percent encoding" : "Invalid absolute HTTP(S) URL" });
    }
  });
  const unique = [...new Map(pages.map(page => [page.url, page])).values()];
  const sources = unique.filter(page => page.status === 404 || page.status === 410);
  const targets = unique.filter(page => page.status >= 200 && page.status < 300);
  if (!sources.length) throw new Error("No 404 or 410 rows were found.");
  if (!targets.length) throw new Error("No 2xx destination rows were found.");
  return { sources, targets, all: unique, ignored: unique.length - sources.length - targets.length, malformed, columns: Object.entries(indexes).filter(([, index]) => index >= 0).map(([name]) => name) };
}
async function decodeCsvFile(file) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder("utf-16le").decode(bytes);
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder("utf-16be").decode(bytes);
  const sample = bytes.slice(0, 200);
  const evenNulls = sample.filter((byte, index) => index % 2 === 0 && byte === 0).length;
  const oddNulls = sample.filter((byte, index) => index % 2 === 1 && byte === 0).length;
  if (oddNulls > sample.length / 8) return new TextDecoder("utf-16le").decode(bytes);
  if (evenNulls > sample.length / 8) return new TextDecoder("utf-16be").decode(bytes);
  return new TextDecoder("utf-8").decode(bytes);
}
function words(value) { return new Set((value.toLowerCase().match(/[a-z0-9]+/g) || []).filter(word => word.length > 1)); }
function parts(page) {
  const parsed = new URL(page.url), path = decodeURIComponent(parsed.pathname).toLowerCase().replace(/^\/+|\/+$/g, "");
  const segments = path.split("/").filter(Boolean);
  return { host: parsed.hostname.replace(/^www\./, ""), path, segments, tokens: words(segments.join(" ")) };
}
function urlType(page) {
  const contentType = (page.content_type || "").toLowerCase();
  const pathname = new URL(page.url).pathname.toLowerCase();
  if (contentType.includes("text/css") || /\.css(?:$|\/)/.test(pathname)) return "css";
  if (/(javascript|ecmascript)/.test(contentType) || /\.(?:js|mjs|cjs)(?:$|\/)/.test(pathname)) return "js";
  if (contentType.includes("font") || /\.(?:woff2?|ttf|otf|eot)(?:$|\/)/.test(pathname)) return "font";
  if (contentType.startsWith("image/") || /\.(?:avif|gif|jpe?g|png|svg|webp)(?:$|\/)/.test(pathname)) return "image";
  if (!contentType || contentType.includes("html") || /\.(?:html?|php)(?:$|\/)/.test(pathname)) return "html";
  return "other";
}
function parentFolder(rawUrl) {
  const segments = new URL(rawUrl).pathname.replace(/^\/+|\/+$/g, "").split("/").filter(Boolean);
  return segments.length > 1 ? `/${segments.slice(0, -1).join("/")}/` : "/";
}
function trigrams(value) {
  const clean = value.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (clean.length < 3) return new Set(clean ? [clean] : []);
  return new Set(Array.from({ length: clean.length - 2 }, (_, index) => clean.slice(index, index + 3)));
}
const STOPWORDS = new Set(["and", "the", "for", "with", "from", "page", "blog", "product", "products", "category", "www", "html", "http", "https"]);
function pageFeatures(page, pageParts) {
  return new Set([...pageParts.tokens, ...words(page.title), ...words(page.h1)].filter(token => !STOPWORDS.has(token)));
}
function addIndex(index, key, targetIndex) {
  if (!key) return;
  if (!index.has(key)) index.set(key, []);
  index.get(key).push(targetIndex);
}
function buildTargetIndex(targets) {
  const targetParts = targets.map(parts), tokenIndex = new Map(), gramIndex = new Map(), directoryIndex = new Map(), typeIndex = new Map();
  targetParts.forEach((targetPart, targetIndex) => {
    pageFeatures(targets[targetIndex], targetPart).forEach(token => addIndex(tokenIndex, token, targetIndex));
    trigrams(targetPart.segments.at(-1) || "").forEach(gram => addIndex(gramIndex, gram, targetIndex));
    addIndex(directoryIndex, targetPart.segments[0] || "", targetIndex);
    addIndex(typeIndex, urlType(targets[targetIndex]), targetIndex);
  });
  return { targetParts, tokenIndex, gramIndex, directoryIndex, typeIndex };
}
function candidateIndices(source, sourceParts, targetCount, index) {
  if (targetCount <= 2000) return Array.from({ length: targetCount }, (_, targetIndex) => targetIndex);
  const quickScores = new Map();
  const award = (candidates, points) => (candidates || []).forEach(targetIndex => quickScores.set(targetIndex, (quickScores.get(targetIndex) || 0) + points));
  pageFeatures(source, sourceParts).forEach(token => award(index.tokenIndex.get(token), 4));
  trigrams(sourceParts.segments.at(-1) || "").forEach(gram => award(index.gramIndex.get(gram), 1));
  award(index.directoryIndex.get(sourceParts.segments[0] || ""), 2);
  const shortlisted = [...quickScores.entries()].sort((a, b) => b[1] - a[1]).slice(0, 250).map(([targetIndex]) => targetIndex);
  const selected = new Set(shortlisted);
  if (selected.size < 100) {
    const step = Math.max(1, Math.floor(targetCount / 150));
    for (let targetIndex = 0; targetIndex < targetCount && selected.size < 250; targetIndex += step) selected.add(targetIndex);
  }
  return [...selected];
}
function typeSafeCandidates(source, candidates, index) {
  const sourceType = urlType(source), matching = new Set(index.typeIndex.get(sourceType) || []);
  const shortlisted = candidates.filter(targetIndex => matching.has(targetIndex));
  return shortlisted.length ? shortlisted : [...matching].slice(0, 250).length ? [...matching].slice(0, 250) : candidates;
}
function similarity(a, b) {
  a = a.toLowerCase().trim(); b = b.toLowerCase().trim();
  if (!a || !b) return 0;
  const rows = Array(b.length + 1).fill(0).map((_, i) => i);
  for (let i = 1; i <= a.length; i++) { let previous = rows[0]; rows[0] = i; for (let j = 1; j <= b.length; j++) { const old = rows[j]; rows[j] = Math.min(rows[j] + 1, rows[j - 1] + 1, previous + (a[i - 1] === b[j - 1] ? 0 : 1)); previous = old; } }
  return 1 - rows[b.length] / Math.max(a.length, b.length, 1);
}
function overlap(a, b) { const union = new Set([...a, ...b]); return union.size ? [...a].filter(item => b.has(item)).length / union.size : 0; }
function pageScore(source, target, a = parts(source), b = parts(target)) {
  const signals = {
    slug: similarity(a.segments.at(-1) || "", b.segments.at(-1) || ""),
    url_tokens: overlap(a.tokens, b.tokens),
    path: similarity(a.path, b.path),
    title: similarity(source.title, target.title),
    h1: similarity(source.h1, target.h1),
    description: overlap(words(source.description), words(target.description)),
  };
  const metadataAvailable = ["title", "h1", "description"].filter(name => source[name] && target[name]);
  const weights = { slug: .30, url_tokens: .22, path: .15, title: .20, h1: .08, description: .05 };
  let usedWeight = weights.slug + weights.url_tokens + weights.path;
  metadataAvailable.forEach(name => { usedWeight += weights[name]; });
  let total = weights.slug * signals.slug + weights.url_tokens * signals.url_tokens + weights.path * signals.path;
  metadataAvailable.forEach(name => { total += weights[name] * signals[name]; });
  total = total / usedWeight + (a.host === b.host ? .03 : 0);
  const labels = { slug: "URL slug", url_tokens: "URL topics", path: "URL path", title: "Title tag", h1: "H1", description: "Meta description" };
  const strongest = Object.entries(signals).filter(([name]) => !["title", "h1", "description"].includes(name) || metadataAvailable.includes(name)).sort((x, y) => y[1] - x[1])[0];
  return { score: Math.min(1, total), strongest: `${labels[strongest[0]]} ${Math.round(strongest[1] * 100)}%` };
}
function escapeHtml(value) { const element = document.createElement("span"); element.textContent = value; return element.innerHTML; }
function csvCell(value) { return `"${String(value).replaceAll('"', '""')}"`; }
function renderSummary(fileName) {
  $("row-count").textContent = crawl.all.length;
  $("source-count").textContent = crawl.sources.length; $("target-count").textContent = crawl.targets.length;
  $("ignored-count").textContent = crawl.ignored;
  $("skipped-count").textContent = crawl.malformed.length;
  $("signal-count").textContent = crawl.columns.filter(column => ["title", "h1", "description"].includes(column)).length;
  const skipped = crawl.malformed.length ? ` · ${crawl.malformed.length} malformed skipped` : "";
  $("crawl-summary").hidden = false; $("crawl-file-status").textContent = `${fileName} · ${crawl.all.length} valid URL rows read${skipped}`;
  $("crawl-file-status").className = "crawl-status loaded";
}
async function importCrawl(file) {
  if (!file) return;
  try { crawl = parseCrawl(await decodeCsvFile(file)); renderSummary(file.name); $("message").textContent = ""; $("progress-panel").hidden = true; $("skipped-section").hidden = true; }
  catch (error) { crawl = { sources: [], targets: [], all: [], ignored: 0, malformed: [], columns: [] }; $("crawl-summary").hidden = true; $("crawl-file-status").textContent = error.message; $("crawl-file-status").className = "crawl-status error"; $("crawl-file").value = ""; }
}
function renderSkippedUrls() {
  const section = $("skipped-section");
  section.hidden = crawl.malformed.length === 0;
  if (section.hidden) return;
  $("skipped-total").textContent = crawl.malformed.length.toLocaleString();
  const visible = crawl.malformed.slice(0, 500);
  $("skipped-results").innerHTML = visible.map(item => `<tr><td>${item.row}</td><td>${escapeHtml(item.url)}</td><td>${escapeHtml(item.status) || "—"}</td><td>${escapeHtml(item.reason)}</td></tr>`).join("");
  $("skipped-note").textContent = crawl.malformed.length > visible.length ? `Showing the first ${visible.length.toLocaleString()} skipped rows. The downloaded CSV includes all ${crawl.malformed.length.toLocaleString()}.` : "These rows were excluded before matching so they could not stop the redirect analysis.";
}
function updateProgress(value, label) {
  const rounded = Math.max(0, Math.min(100, Math.round(value)));
  $("progress").value = rounded; $("progress").textContent = `${rounded}%`; $("progress-value").value = `${rounded}%`; $("progress-label").textContent = label;
}
function yieldToBrowser() { return new Promise(resolve => setTimeout(resolve, 0)); }
async function mapPages() {
  if (!crawl.sources.length || !crawl.targets.length) { $("message").textContent = "Upload a crawl CSV before creating suggestions."; return; }
  const button = $("map"), minimum = Number($("threshold").value);
  button.disabled = true; button.textContent = "Creating suggestions…"; $("progress-panel").hidden = false; $("results-section").hidden = true; $("message").textContent = ""; latest = [];
  try {
    updateProgress(2, `Indexing ${crawl.targets.length.toLocaleString()} live URLs…`); await yieldToBrowser();
    const index = buildTargetIndex(crawl.targets); updateProgress(6, `Matching ${crawl.sources.length.toLocaleString()} broken URLs…`); await yieldToBrowser();
    for (let sourceIndex = 0; sourceIndex < crawl.sources.length; sourceIndex++) {
      const source = crawl.sources[sourceIndex], sourceParts = parts(source);
      const candidates = typeSafeCandidates(source, candidateIndices(source, sourceParts, crawl.targets.length, index), index);
      let best = null, runnerUp = null;
      for (const targetIndex of candidates) {
        const result = { target: crawl.targets[targetIndex], ...pageScore(source, crawl.targets[targetIndex], sourceParts, index.targetParts[targetIndex]) };
        if (!best || result.score > best.score) { runnerUp = best; best = result; }
        else if (!runnerUp || result.score > runnerUp.score) runnerUp = result;
      }
      const gap = best.score - (runnerUp?.score || 0), score = Math.round(best.score * 1000) / 10;
      const confidence = score < minimum ? "review" : score >= 78 && gap >= .08 ? "high" : score >= 60 ? "medium" : "low";
      const sourceFolder = parentFolder(source.url), destinationFolder = parentFolder(best.target.url);
      latest.push({ source_url: source.url, source_status: source.status, url_type: urlType(source), destination_url: best.target.url, destination_status: best.target.status, source_folder: sourceFolder, destination_folder: destinationFolder, folder_direction: `${sourceFolder} → ${destinationFolder}`, score, strongest_signal: best.strongest, confidence });
      if (sourceIndex % 5 === 0 || sourceIndex === crawl.sources.length - 1) {
        const complete = sourceIndex + 1; updateProgress(6 + 89 * complete / crawl.sources.length, `Matched ${complete.toLocaleString()} of ${crawl.sources.length.toLocaleString()} broken URLs…`); await yieldToBrowser();
      }
    }
    updateProgress(97, "Rendering results…"); await yieldToBrowser();
    const typeOrder = { html: 0, image: 1, other: 2, css: 3, js: 4, font: 5 };
    latest.sort((a, b) => typeOrder[a.url_type] - typeOrder[b.url_type]);
    const visible = latest.slice(0, 500);
    $("results").innerHTML = visible.map(item => `<tr><td>${escapeHtml(item.source_url)}</td><td><span class="type-badge ${item.url_type}">${item.url_type}</span></td><td>${escapeHtml(item.destination_url) || "—"}</td><td class="folder-direction">${escapeHtml(item.folder_direction)}</td><td class="score">${item.score}%</td><td>${escapeHtml(item.strongest_signal)}</td><td><span class="badge ${item.confidence}">${item.confidence}</span></td></tr>`).join("");
    renderSkippedUrls();
    updateProgress(100, `Complete — ${latest.length.toLocaleString()} suggestions created`);
    const skippedNote = crawl.malformed.length ? ` ${crawl.malformed.length.toLocaleString()} malformed URL${crawl.malformed.length === 1 ? " was" : "s were"} skipped and noted below.` : "";
    $("message").textContent = (latest.length > visible.length ? `Showing the first ${visible.length.toLocaleString()} suggestions. Download CSV includes all ${latest.length.toLocaleString()}.` : `${latest.length.toLocaleString()} redirect suggestions created.`) + skippedNote;
    $("results-section").hidden = false; $("results-section").scrollIntoView({ behavior: "smooth" });
  } catch (error) {
    updateProgress(0, "Processing stopped"); $("message").textContent = `Could not create suggestions: ${error.message}`;
  } finally {
    button.disabled = false; button.textContent = "Create redirect suggestions";
  }
}

$("threshold").addEventListener("input", event => $("threshold-value").value = event.target.value);
$("crawl-file").addEventListener("change", event => importCrawl(event.target.files[0]));
$("map").addEventListener("click", () => mapPages());
$("example").addEventListener("click", async () => { crawl = parseCrawl("URL,Status Code,Title 1,H1-1,Meta Description,Content Type\nhttps://example.com/old/technical-seo-checklist,404,Technical SEO Checklist,Technical SEO Checklist,Audit your technical SEO,text/html\nhttps://example.com/products/blue-running-shoes,404,Blue Running Shoes,Blue Running Shoes,Lightweight shoes for runners,text/html\nhttps://example.com/resources/technical-seo-audit-checklist,200,Technical SEO Audit Checklist,Technical SEO Checklist,A complete technical audit guide,text/html\nhttps://example.com/products/mens-blue-running-shoe,200,Men's Blue Running Shoe,Blue Running Shoe,Lightweight blue shoes for runners,text/html\nhttps://example.com/old-assets/site.css,404,,,,text/css\nhttps://example.com/assets/site.min.css,200,,,,text/css\nhttps://example.com/old-scripts/app.js,404,,,,application/javascript\nhttps://example.com/assets/app.min.js,200,,,,application/javascript\nhttps://example.com/old-fonts/brand.woff2,404,,,,font/woff2\nhttps://example.com/fonts/brand.woff2,200,,,,font/woff2\nhttps://example.com/broken%ZZ-url,404,Broken URL,,,text/html"); renderSummary("example-crawl.csv"); await mapPages(); });
$("download").addEventListener("click", () => { const columns = ["record_type", "source_url", "source_status", "url_type", "destination_url", "destination_status", "source_folder", "destination_folder", "folder_direction", "score", "strongest_signal", "confidence", "csv_row", "notes"]; const suggestions = latest.map(item => ({ record_type: "redirect_suggestion", ...item, csv_row: "", notes: "" })); const skipped = crawl.malformed.map(item => ({ record_type: "skipped_malformed", source_url: item.url, source_status: item.status, url_type: "malformed", destination_url: "", destination_status: "", source_folder: "", destination_folder: "", folder_direction: "", score: "", strongest_signal: "", confidence: "skipped", csv_row: item.row, notes: item.reason })); const body = [...suggestions, ...skipped].map(item => columns.map(column => csvCell(item[column] ?? "")).join(",")).join("\n"); const link = document.createElement("a"); link.href = URL.createObjectURL(new Blob([columns.join(",") + "\n" + body], { type: "text/csv" })); link.download = "redirect-map.csv"; link.click(); URL.revokeObjectURL(link.href); });
