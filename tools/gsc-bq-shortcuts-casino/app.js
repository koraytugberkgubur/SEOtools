const catalog = window.QUERY_CATALOG || [];
const state = {
  token: null,
  tokenClient: null,
  selected: null,
  category: "All",
  country: "all",
  intent: "all",
  baseRows: [],
  fields: [],
  resultStats: null,
  rows: [],
};

const COUNTRIES = [
  { id: "all", label: "All countries", summary: "Keep every market in its original order", terms: [] },
  { id: "uk", label: "UK", summary: "Prioritize United Kingdom casino demand", terms: ["uk", "united kingdom", "britain", "british", "england", "co uk"] },
  { id: "us", label: "US", summary: "Prioritize United States casino demand", terms: ["us", "usa", "united states", "american", "new jersey", "pennsylvania", "michigan"] },
  { id: "canada", label: "Canada", summary: "Prioritize Canadian casino demand", terms: ["canada", "canadian", "ontario", "alberta", "quebec"] },
  { id: "australia", label: "Australia", summary: "Prioritize Australian casino demand", terms: ["australia", "australian", "aussie"] },
  { id: "germany", label: "Germany", summary: "Prioritize German casino demand", terms: ["germany", "german", "deutschland"] },
  { id: "new-zealand", label: "New Zealand", summary: "Prioritize New Zealand casino demand", terms: ["new zealand", "new zealanders", "kiwi", "nz"] },
];

const INTENTS = [
  { id: "all", label: "All intents", summary: "Keep the shortcut's original ranking", terms: [] },
  { id: "best-casinos", label: "Best casinos", summary: "Surface comparison and top-list demand", terms: ["best casino", "best casinos", "top casino", "top casinos", "casino review", "casino reviews", "recommended casino"] },
  { id: "bonuses", label: "Bonuses", summary: "Bring promotional and offer-led searches first", terms: ["casino bonus", "bonuses", "welcome bonus", "no deposit", "free spins", "promo code", "promotion"] },
  { id: "slots", label: "Slots", summary: "Prioritize slot game and provider demand", terms: ["slots", "slot games", "online slots", "free slots", "jackpot slots", "slot provider"] },
  { id: "live-casino", label: "Live casino", summary: "Prioritize live dealer and table-game demand", terms: ["live casino", "live dealer", "blackjack", "roulette", "baccarat", "poker"] },
  { id: "payments", label: "Payments", summary: "Surface deposit, withdrawal, and payment intent", terms: ["payment", "deposit", "withdrawal", "payout", "paypal", "crypto casino", "bitcoin casino"] },
];

const $ = (selector) => document.querySelector(selector);
const elements = {
  configForm: $("#configForm"), clientId: $("#clientId"), projectId: $("#projectId"), location: $("#location"),
  dataset: $("#dataset"), tableName: $("#tableName"), inspectionTable: $("#inspectionTable"),
  connectButton: $("#connectButton"), disconnectButton: $("#disconnectButton"), connectionChip: $("#connectionChip"),
  querySearch: $("#querySearch"), categoryTabs: $("#categoryTabs"), queryGrid: $("#queryGrid"),
  countryTabs: $("#countryTabs"), countrySummary: $("#countrySummary"),
  intentTabs: $("#intentTabs"), intentSummary: $("#intentSummary"),
  resultStatus: $("#resultStatus"), resultTitle: $("#resultTitle"), queryDetail: $("#queryDetail"),
  copySqlButton: $("#copySqlButton"), dryRunButton: $("#dryRunButton"), runQueryButton: $("#runQueryButton"),
  downloadFullButton: $("#downloadFullButton"),
  resultMeta: $("#resultMeta"), tableShell: $("#tableShell"), resultsTable: $("#resultsTable"), emptyState: $("#emptyState"), toast: $("#toast"),
};

const STORAGE_KEY = "gsc-bq-shortcuts-config-v1";
const RENDER_ROW_LIMIT = 1000;
const AUTO_DOWNLOAD_ROW_LIMIT = 5000;
const QUERY_PAGE_SIZE = 10000;
const configFields = ["clientId", "projectId", "location", "dataset", "tableName", "inspectionTable"];

function loadConfig() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    configFields.forEach((key) => { if (saved[key]) elements[key].value = saved[key]; });
  } catch { /* ignore malformed local settings */ }
}

function getConfig() {
  const config = Object.fromEntries(configFields.map((key) => [key, elements[key].value.trim()]));
  config.location ||= "US";
  return config;
}

function saveConfig() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(getConfig()));
}

function validateIdentifier(value, label) {
  if (!/^[A-Za-z0-9_:\-.]+$/.test(value)) throw new Error(`${label} contains an unsupported character.`);
}

function validateConfig({ clientId, projectId, dataset, tableName, inspectionTable }) {
  if (!clientId || !clientId.endsWith(".apps.googleusercontent.com")) throw new Error("Enter a valid Google OAuth client ID.");
  if (!projectId || !dataset || !tableName) throw new Error("Project ID, dataset, and performance table are required.");
  validateIdentifier(projectId, "Project ID"); validateIdentifier(dataset, "Dataset"); validateIdentifier(tableName, "Table name");
  if (inspectionTable) validateIdentifier(inspectionTable, "URL Inspection table");
}

function hydrateSql(query) {
  const config = getConfig();
  if (!config.projectId || !config.dataset || !config.tableName) throw new Error("Complete the BigQuery source fields first.");
  [config.projectId, config.dataset, config.tableName, config.inspectionTable || "url_inspection"].forEach((value, index) => validateIdentifier(value, ["Project ID", "Dataset", "Table name", "URL Inspection table"][index]));
  const table = `${config.projectId}.${config.dataset}.${config.tableName}`;
  const inspection = `${config.projectId}.${config.dataset}.${config.inspectionTable || "url_inspection"}`;
  return query.sql
    .replaceAll("`{{TABLE}}`", `\`${table}\``)
    .replaceAll("`{{INSPECTION_TABLE}}`", `\`${inspection}\``)
    .replaceAll("{{TABLE}}", table)
    .replaceAll("{{INSPECTION_TABLE}}", inspection);
}

async function collectQueryPages(payload, config, onProgress) {
  const rows = [...(payload.rows || [])];
  const jobId = payload.jobReference?.jobId;
  let pageToken = payload.pageToken;
  while (pageToken && jobId) {
    onProgress?.(rows.length);
    const url = new URL(`https://bigquery.googleapis.com/bigquery/v2/projects/${encodeURIComponent(config.projectId)}/queries/${encodeURIComponent(jobId)}`);
    url.searchParams.set("location", config.location);
    url.searchParams.set("maxResults", String(QUERY_PAGE_SIZE));
    url.searchParams.set("pageToken", pageToken);
    const page = await authorizedFetch(url.toString());
    rows.push(...(page.rows || []));
    pageToken = page.pageToken;
  }
  onProgress?.(rows.length);
  return { ...payload, rows };
}

function showToast(message, isError = false) {
  elements.toast.textContent = message;
  elements.toast.className = `toast show${isError ? " error" : ""}`;
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => { elements.toast.className = "toast"; }, 4200);
}

function setConnected(connected) {
  elements.connectionChip.classList.toggle("connected", connected);
  elements.connectionChip.innerHTML = `<span></span>${connected ? " Connected to Google" : " Not connected"}`;
  elements.connectButton.textContent = connected ? "Reconnect Google" : "Connect Google";
  elements.disconnectButton.hidden = !connected;
}

function connectGoogle() {
  try {
    const config = getConfig(); validateConfig(config); saveConfig();
    if (!window.google?.accounts?.oauth2) throw new Error("Google sign-in is still loading. Try again in a moment.");
    state.tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: config.clientId,
      scope: "https://www.googleapis.com/auth/bigquery",
      callback: (response) => {
        if (response.error) return showToast(response.error_description || response.error, true);
        state.token = response.access_token;
        setConnected(true);
        showToast("Connected. Choose a shortcut and run it.");
      },
      error_callback: (error) => showToast(error.message || "Google authorization was closed.", true),
    });
    state.tokenClient.requestAccessToken({ prompt: state.token ? "" : "consent" });
  } catch (error) { showToast(error.message, true); }
}

function disconnectGoogle() {
  if (state.token && window.google?.accounts?.oauth2) google.accounts.oauth2.revoke(state.token, () => {});
  state.token = null; setConnected(false); showToast("Google connection removed.");
}

async function authorizedFetch(url, options = {}) {
  if (!state.token) throw new Error("Connect your Google account first.");
  const response = await fetch(url, {
    ...options,
    headers: { Authorization: `Bearer ${state.token}`, "Content-Type": "application/json", ...(options.headers || {}) },
  });
  const payload = await response.json().catch(() => ({}));
  if (response.status === 401) { state.token = null; setConnected(false); throw new Error("Google authorization expired. Connect again."); }
  if (!response.ok) throw new Error(payload.error?.message || `BigQuery returned ${response.status}.`);
  return payload;
}

function renderCategories() {
  const categories = ["All", ...new Set(catalog.map((query) => query.category))];
  elements.categoryTabs.innerHTML = categories.map((category) => `<button class="category-tab${state.category === category ? " active" : ""}" data-category="${category}" role="tab" aria-selected="${state.category === category}">${category}</button>`).join("");
}

function renderLenses() {
  const country = COUNTRIES.find((item) => item.id === state.country) || COUNTRIES[0];
  const intent = INTENTS.find((item) => item.id === state.intent) || INTENTS[0];
  elements.countrySummary.textContent = country.summary;
  elements.intentSummary.textContent = intent.summary;
  elements.countryTabs.innerHTML = COUNTRIES.map((item) => `
    <button class="topic-tab${item.id === state.country ? " active" : ""}" data-country="${item.id}" role="tab" aria-selected="${item.id === state.country}">
      <span>${item.label}</span><i>${item.id === "all" ? "Global view" : `${item.terms.length} market signals`}</i>
    </button>`).join("");
  elements.intentTabs.innerHTML = INTENTS.map((item) => `
    <button class="topic-tab${item.id === state.intent ? " active" : ""}" data-intent="${item.id}" role="tab" aria-selected="${item.id === state.intent}">
      <span>${item.label}</span><i>${item.id === "all" ? "Original order" : `${item.terms.length} intent signals`}</i>
    </button>`).join("");
}

function renderQueries() {
  const term = elements.querySearch.value.trim().toLowerCase();
  const filtered = catalog.filter((query) => (state.category === "All" || query.category === state.category) && `${query.title} ${query.summary}`.toLowerCase().includes(term));
  elements.queryGrid.innerHTML = filtered.length ? filtered.map((query) => `
    <button class="query-card${state.selected?.id === query.id ? " selected" : ""}" data-id="${query.id}">
      <span class="card-index">${query.id.toUpperCase()} · ${query.category}</span>
      <h3>${query.title}</h3><p>${query.summary}</p>
    </button>`).join("") : `<div class="no-results">No shortcut matches that filter.</div>`;
}

function selectQuery(id) {
  state.selected = catalog.find((query) => query.id === id);
  state.baseRows = [];
  state.rows = [];
  elements.downloadFullButton.disabled = true;
  renderQueries();
  renderSelectedQuery();
}

function renderSelectedQuery(scroll = true) {
  elements.resultTitle.textContent = state.selected.title;
  const country = COUNTRIES.find((item) => item.id === state.country) || COUNTRIES[0];
  const intent = INTENTS.find((item) => item.id === state.intent) || INTENTS[0];
  elements.resultStatus.textContent = `${state.selected.category} · ${country.label} · ${intent.label}`;
  let sql = "";
  try { sql = hydrateSql(state.selected); } catch (error) { sql = `-- ${error.message}\n-- Connect Google, then use Copy SQL, Estimate cost, or Run query to prepare this filter.`; }
  elements.queryDetail.innerHTML = `
    <p>${state.selected.summary}</p>
    ${state.selected.requiresInspectionTable ? '<p><strong>Requires:</strong> a populated URL Inspection table.</p>' : ""}
    <details><summary>Inspect SQL and workbook notes</summary><pre><code>${escapeHtml(sql)}</code></pre><div class="query-note">${escapeHtml(state.selected.notes)}</div></details>`;
  elements.copySqlButton.disabled = false;
  elements.dryRunButton.disabled = false;
  elements.runQueryButton.disabled = false;
  elements.emptyState.hidden = false; elements.tableShell.hidden = true; elements.resultMeta.hidden = true;
  if (scroll) $("#resultDrawer").scrollIntoView({ behavior: "smooth", block: "start" });
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[char]));
}

async function dryRun() {
  if (!state.selected) return;
  const config = getConfig();
  try {
    elements.dryRunButton.disabled = true; elements.resultStatus.textContent = "Estimating bytes…";
    const payload = await authorizedFetch(`https://bigquery.googleapis.com/bigquery/v2/projects/${encodeURIComponent(config.projectId)}/jobs`, {
      method: "POST",
      body: JSON.stringify({ jobReference: { projectId: config.projectId, location: config.location }, configuration: { dryRun: true, query: { query: hydrateSql(state.selected), useLegacySql: false } } }),
    });
    const bytes = Number(payload.statistics?.totalBytesProcessed || 0);
    elements.resultStatus.textContent = "Cost estimate ready";
    showToast(`This query will scan about ${formatBytes(bytes)}.`);
  } catch (error) { elements.resultStatus.textContent = "Estimate failed"; showToast(error.message, true); }
  finally { elements.dryRunButton.disabled = false; }
}

async function runQuery() {
  if (!state.selected) return;
  const config = getConfig();
  try {
    validateConfig(config); saveConfig();
    elements.runQueryButton.disabled = true; elements.dryRunButton.disabled = true;
    elements.downloadFullButton.disabled = true; state.rows = [];
    elements.resultStatus.textContent = "Running in BigQuery…";
    elements.resultMeta.hidden = true; elements.tableShell.hidden = true; elements.emptyState.hidden = false;
    elements.emptyState.innerHTML = '<div class="empty-glyph">RUN<br />•••</div><p>BigQuery is processing the selected shortcut.</p>';
    let payload = await authorizedFetch(`https://bigquery.googleapis.com/bigquery/v2/projects/${encodeURIComponent(config.projectId)}/queries`, {
      method: "POST",
      body: JSON.stringify({ query: hydrateSql(state.selected), useLegacySql: false, location: config.location, maxResults: QUERY_PAGE_SIZE, timeoutMs: 20000 }),
    });
    while (!payload.jobComplete) {
      await new Promise((resolve) => setTimeout(resolve, 1100));
      payload = await authorizedFetch(`https://bigquery.googleapis.com/bigquery/v2/projects/${encodeURIComponent(config.projectId)}/queries/${encodeURIComponent(payload.jobReference.jobId)}?location=${encodeURIComponent(config.location)}&maxResults=${QUERY_PAGE_SIZE}`);
    }
    payload = await collectQueryPages(payload, config, (count) => {
      elements.resultStatus.textContent = `Downloading full result… ${count.toLocaleString()} rows`;
    });
    renderResult(payload);
  } catch (error) {
    elements.resultStatus.textContent = "Query failed";
    elements.resultMeta.hidden = true; elements.tableShell.hidden = true; elements.downloadFullButton.disabled = true;
    elements.emptyState.hidden = false;
    elements.emptyState.innerHTML = `<div class="empty-glyph">ERROR<br />×</div><p>${escapeHtml(error.message)}</p>`;
    showToast(error.message, true);
  } finally {
    elements.runQueryButton.disabled = false; elements.dryRunButton.disabled = false;
  }
}

function renderResult(payload) {
  const fields = payload.schema?.fields || [];
  const rows = payload.rows || [];
  state.fields = fields;
  state.baseRows = rows.map((row) => Object.fromEntries(fields.map((field, index) => [field.name, normalizeCell(row.f?.[index]?.v)])));
  state.resultStats = {
    totalBytesProcessed: Number(payload.totalBytesProcessed || 0),
    cacheHit: Boolean(payload.cacheHit),
  };
  renderPrioritizedResult(true);
}

function normalizeMatchText(value) {
  return String(formatCell(value) || "").toLowerCase().replace(/[_/\-]+/g, " ").replace(/\s+/g, " ");
}

function textMatchesTerm(value, term) {
  const normalizedTerm = normalizeMatchText(term);
  if (normalizedTerm.length > 4 || normalizedTerm.includes(" ")) return value.includes(normalizedTerm);
  return new RegExp(`(?:^|\\s)${normalizedTerm}(?:$|\\s)`).test(value);
}

function lensMatchScore(row, lens) {
  if (!lens.terms.length) return 0;
  const priorityValues = Object.entries(row)
    .filter(([key]) => /(url|page|query|keyword|search|term)/i.test(key))
    .map(([, value]) => normalizeMatchText(value));
  const fallbackValues = Object.values(row).map(normalizeMatchText);
  return lens.terms.reduce((score, term) => {
    if (priorityValues.some((value) => textMatchesTerm(value, term))) return score + 3;
    if (fallbackValues.some((value) => textMatchesTerm(value, term))) return score + 1;
    return score;
  }, 0);
}

function renderPrioritizedResult(allowAutomaticDownload = false) {
  const country = COUNTRIES.find((item) => item.id === state.country) || COUNTRIES[0];
  const intent = INTENTS.find((item) => item.id === state.intent) || INTENTS[0];
  const hasLens = country.id !== "all" || intent.id !== "all";
  const rankedRows = state.baseRows.map((row, originalIndex) => ({ row, originalIndex, score: lensMatchScore(row, country) + lensMatchScore(row, intent) }));
  if (hasLens) rankedRows.sort((a, b) => b.score - a.score || a.originalIndex - b.originalIndex);
  state.rows = rankedRows.map(({ row }) => row);
  const matchedRows = rankedRows.filter(({ score }) => score > 0).length;
  const fields = state.fields;
  const visibleRows = state.rows.slice(0, RENDER_ROW_LIMIT);
  const lensLabel = [country.id === "all" ? "" : country.label, intent.id === "all" ? "" : intent.label].filter(Boolean).join(" + ");
  elements.resultStatus.textContent = hasLens ? `${lensLabel} prioritized` : "Query complete";
  elements.resultMeta.hidden = false;
  elements.resultMeta.innerHTML = `<span>${state.rows.length.toLocaleString()} rows downloaded</span>${hasLens ? `<span class="topic-match-meta">${matchedRows.toLocaleString()} ${escapeHtml(lensLabel.toLowerCase())} matches ranked first</span>` : ""}<span>${visibleRows.length.toLocaleString()} displayed</span><span>${formatBytes(state.resultStats?.totalBytesProcessed || 0)} processed</span><span>${state.resultStats?.cacheHit ? "cache hit" : "live execution"}</span>`;
  elements.downloadFullButton.disabled = !state.rows.length;
  elements.emptyState.hidden = true; elements.tableShell.hidden = false;
  if (!fields.length) {
    elements.tableShell.hidden = true; elements.emptyState.hidden = false;
    elements.emptyState.innerHTML = '<div class="empty-glyph">DONE<br />0</div><p>The query completed but returned no rows.</p>';
    return;
  }
  elements.resultsTable.innerHTML = `<thead><tr>${fields.map((field) => `<th>${escapeHtml(field.name)}</th>`).join("")}</tr></thead><tbody>${visibleRows.map((row) => `<tr class="${lensMatchScore(row, country) + lensMatchScore(row, intent) > 0 ? "topic-match" : ""}">${fields.map((field) => `<td>${escapeHtml(formatCell(row[field.name]))}</td>`).join("")}</tr>`).join("")}</tbody>`;
  if (allowAutomaticDownload && state.rows.length > AUTO_DOWNLOAD_ROW_LIMIT) {
    window.setTimeout(() => downloadCsv(true), 0);
  }
}

function normalizeCell(value) {
  if (value && typeof value === "object") {
    if (Array.isArray(value)) return value.map((item) => normalizeCell(item.v));
    return JSON.stringify(value);
  }
  return value ?? "";
}
function formatCell(value) { return Array.isArray(value) ? value.join(", ") : value; }
function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB", "PB"]; const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** index).toFixed(index > 1 ? 2 : 0)} ${units[index]}`;
}

function downloadCsv(automatic = false) {
  if (!state.rows.length) return;
  const headers = Object.keys(state.rows[0]);
  const csvSafe = (value) => {
    const text = String(formatCell(value));
    return /^[=+\-@]/.test(text) ? `'${text}` : text;
  };
  const csv = [headers, ...state.rows.map((row) => headers.map((header) => row[header]))]
    .map((row) => row.map((value) => `"${csvSafe(value).replaceAll('"', '""')}"`).join(",")).join("\n");
  const anchor = document.createElement("a"); anchor.href = URL.createObjectURL(new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" }));
  anchor.download = `${state.selected.id}-${state.selected.title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${state.country}-${state.intent}.csv`; anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(anchor.href), 1000);
  showToast(automatic ? `The ${state.rows.length.toLocaleString()}-row result was too large to render fully, so its CSV download started automatically.` : `Downloading all ${state.rows.length.toLocaleString()} rows.`);
}

elements.connectButton.addEventListener("click", connectGoogle);
elements.disconnectButton.addEventListener("click", disconnectGoogle);
elements.configForm.addEventListener("change", () => {
  saveConfig();
  state.baseRows = [];
  state.rows = [];
  elements.downloadFullButton.disabled = true;
  if (state.selected) renderSelectedQuery(false);
});
elements.categoryTabs.addEventListener("click", (event) => { const button = event.target.closest("[data-category]"); if (!button) return; state.category = button.dataset.category; renderCategories(); renderQueries(); });
elements.countryTabs.addEventListener("click", (event) => {
  const button = event.target.closest("[data-country]");
  if (!button) return;
  state.country = button.dataset.country;
  renderLenses();
  if (state.baseRows.length) renderPrioritizedResult(false);
  else if (state.selected) renderSelectedQuery(false);
  const country = COUNTRIES.find((item) => item.id === state.country);
  showToast(country.id === "all" ? "Global market view restored." : `${country.label} matches will rank first.`);
});
elements.intentTabs.addEventListener("click", (event) => {
  const button = event.target.closest("[data-intent]");
  if (!button) return;
  state.intent = button.dataset.intent;
  renderLenses();
  if (state.baseRows.length) renderPrioritizedResult(false);
  else if (state.selected) renderSelectedQuery(false);
  const intent = INTENTS.find((item) => item.id === state.intent);
  showToast(intent.id === "all" ? "Original intent order restored." : `${intent.label} matches will rank first.`);
});
elements.queryGrid.addEventListener("click", (event) => { const card = event.target.closest("[data-id]"); if (card) selectQuery(card.dataset.id); });
elements.querySearch.addEventListener("input", renderQueries);
elements.copySqlButton.addEventListener("click", async () => { try { await navigator.clipboard.writeText(hydrateSql(state.selected)); renderSelectedQuery(false); showToast("SQL copied."); } catch (error) { showToast(error.message, true); } });
elements.dryRunButton.addEventListener("click", dryRun);
elements.runQueryButton.addEventListener("click", runQuery);
elements.downloadFullButton.addEventListener("click", () => downloadCsv(false));

loadConfig(); renderLenses(); renderCategories(); renderQueries(); setConnected(false);
