const catalog = window.QUERY_CATALOG || [];
const state = {
  token: null,
  tokenClient: null,
  selected: null,
  category: "All",
  pageScope: "all",
  rows: [],
};

const industryConfig = window.INDUSTRY_CONFIG || { pageScopes: [], filterPresets: { page: [], query: [] } };
const PAGE_SCOPES = industryConfig.pageScopes;
const FILTER_PRESETS = industryConfig.filterPresets;

const $ = (selector) => document.querySelector(selector);
const elements = {
  configForm: $("#configForm"), clientId: $("#clientId"), projectId: $("#projectId"), location: $("#location"),
  dataset: $("#dataset"), tableName: $("#tableName"), inspectionTable: $("#inspectionTable"),
  connectButton: $("#connectButton"), disconnectButton: $("#disconnectButton"), connectionChip: $("#connectionChip"),
  querySearch: $("#querySearch"), categoryTabs: $("#categoryTabs"), queryGrid: $("#queryGrid"),
  pageScopeTabs: $("#pageScopeTabs"), pageScopeSummary: $("#pageScopeSummary"),
  customScopeEditor: $("#customScopeEditor"), customScopeRegex: $("#customScopeRegex"),
  dataFilters: $("#dataFilters"), pageFilter: $("#pageFilter"), pageFilterMode: $("#pageFilterMode"),
  queryFilter: $("#queryFilter"), queryFilterMode: $("#queryFilterMode"), filterSummary: $("#filterSummary"), activeFilterCount: $("#activeFilterCount"),
  pageQuickFilters: $("#pageQuickFilters"), queryQuickFilters: $("#queryQuickFilters"),
  resultStatus: $("#resultStatus"), resultTitle: $("#resultTitle"), queryDetail: $("#queryDetail"),
  copySqlButton: $("#copySqlButton"), dryRunButton: $("#dryRunButton"), runQueryButton: $("#runQueryButton"),
  downloadFullButton: $("#downloadFullButton"),
  resultMeta: $("#resultMeta"), tableShell: $("#tableShell"), resultsTable: $("#resultsTable"), emptyState: $("#emptyState"), toast: $("#toast"),
};

const STORAGE_KEY = "gsc-bq-allergy-shortcuts-config-v1";
const RENDER_ROW_LIMIT = 1000;
const AUTO_DOWNLOAD_ROW_LIMIT = 5000;
const QUERY_PAGE_SIZE = 10000;
const configFields = ["clientId", "projectId", "location", "dataset", "tableName", "inspectionTable", "customScopeRegex", "pageFilter", "pageFilterMode", "queryFilter", "queryFilterMode"];

function loadConfig() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    configFields.forEach((key) => { if (saved[key]) elements[key].value = saved[key]; });
    if (PAGE_SCOPES.some((scope) => scope.id === saved.pageScope)) state.pageScope = saved.pageScope;
  } catch { /* ignore malformed local settings */ }
}

function getConfig() {
  const config = Object.fromEntries(configFields.map((key) => [key, elements[key].value.trim()]));
  config.location ||= "US";
  return config;
}

function saveConfig() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...getConfig(), pageScope: state.pageScope }));
}

function validateIdentifier(value, label) {
  if (!/^[A-Za-z0-9_:\-.]+$/.test(value)) throw new Error(`${label} contains an unsupported character.`);
}

function validateConfig({ clientId, projectId, dataset, tableName }) {
  if (!clientId || !clientId.endsWith(".apps.googleusercontent.com")) throw new Error("Enter a valid Google OAuth client ID.");
  if (!projectId || !dataset || !tableName) throw new Error("Project ID, dataset, and performance table are required.");
  validateIdentifier(projectId, "Project ID"); validateIdentifier(dataset, "Dataset"); validateIdentifier(tableName, "Table name");
}

function hydrateSql(query) {
  const config = getConfig();
  if (!config.projectId || !config.dataset || !config.tableName) throw new Error("Complete the BigQuery source fields first.");
  [config.projectId, config.dataset, config.tableName].forEach((value, index) => validateIdentifier(value, ["Project ID", "Dataset", "Table name"][index]));
  const table = `${config.projectId}.${config.dataset}.${config.tableName}`;
  const inspection = `${config.projectId}.${config.dataset}.${config.inspectionTable || "url_inspection"}`;
  const scope = PAGE_SCOPES.find((item) => item.id === state.pageScope) || PAGE_SCOPES[0];
  const filters = getFilters();
  const scopedSource = (source, queryAware = false) => {
    const predicates = [];
    if (scope.custom && config.customScopeRegex) predicates.push(filterPredicate("url", "scope_filter", "regex"));
    else if (scope.pattern) predicates.push(`REGEXP_CONTAINS(url, r'(?i)^https?://[^/]+(?:${scope.pattern})')`);
    if (filters.page.value) predicates.push(filterPredicate("url", "page_filter", filters.page.mode));
    if (queryAware && filters.query.value) predicates.push(filterPredicate("query", "query_filter", filters.query.mode));
    if (!predicates.length) return `\`${source}\``;
    return `(SELECT * FROM \`${source}\` WHERE ${predicates.join(" AND ")})`;
  };
  return query.sql
    .replaceAll("`{{TABLE}}`", scopedSource(table, true))
    .replaceAll("`{{INSPECTION_TABLE}}`", scopedSource(inspection))
    .replaceAll("{{TABLE}}", table)
    .replaceAll("{{INSPECTION_TABLE}}", inspection);
}

function getFilters() {
  return {
    page: { value: elements.pageFilter.value.trim(), mode: elements.pageFilterMode.value },
    query: { value: elements.queryFilter.value.trim(), mode: elements.queryFilterMode.value },
  };
}

function filterPredicate(column, parameter, mode) {
  if (mode === "regex") return `REGEXP_CONTAINS(${column}, CONCAT('(?i)', @${parameter}))`;
  if (mode === "exact") return `LOWER(${column}) = LOWER(@${parameter})`;
  if (mode === "starts") return `STARTS_WITH(LOWER(${column}), LOWER(@${parameter}))`;
  if (mode === "ends") return `ENDS_WITH(LOWER(${column}), LOWER(@${parameter}))`;
  const contains = `STRPOS(LOWER(${column}), LOWER(@${parameter})) > 0`;
  return mode === "excludes" ? `NOT (${contains})` : contains;
}

function validateFilters() {
  const filters = getFilters();
  Object.entries(filters).forEach(([name, filter]) => {
    if (filter.value && filter.mode === "regex") {
      try { new RegExp(filter.value); } catch { throw new Error(`The ${name} filter is not a valid regular expression.`); }
    }
  });
  const scope = PAGE_SCOPES.find((item) => item.id === state.pageScope);
  const customScopeRegex = elements.customScopeRegex.value.trim();
  if (scope?.custom && customScopeRegex) {
    try { new RegExp(customScopeRegex); } catch { throw new Error("The custom page-group regex is not valid."); }
  }
  return filters;
}

function getNamedParameters() {
  const filters = validateFilters();
  const queryParameters = Object.entries(filters)
    .filter(([, filter]) => filter.value)
    .map(([name, filter]) => ({ name: `${name}_filter`, value: filter.value }));
  const scope = PAGE_SCOPES.find((item) => item.id === state.pageScope);
  const customScopeRegex = elements.customScopeRegex.value.trim();
  if (scope?.custom && customScopeRegex) queryParameters.unshift({ name: "scope_filter", value: customScopeRegex });
  return queryParameters;
}

function getQueryParameters() {
  const queryParameters = getNamedParameters().map(({ name, value }) => ({
    name,
    parameterType: { type: "STRING" },
    parameterValue: { value },
  }));
  return queryParameters.length ? { parameterMode: "NAMED", queryParameters } : {};
}

function getPortableSql(query) {
  const parameters = getNamedParameters();
  let sql = hydrateSql(query);
  const declarations = [];
  parameters.forEach(({ name, value }) => {
    const escapedValue = value.replaceAll("\\", "\\\\").replaceAll("'", "\\'");
    declarations.push(`DECLARE ${name} STRING DEFAULT '${escapedValue}';`);
    sql = sql.replaceAll(`@${name}`, name);
  });
  return declarations.length ? `${declarations.join("\n")}\n\n${sql}` : sql;
}

function renderFilterSummary() {
  const filters = getFilters();
  const active = Object.values(filters).filter((filter) => filter.value).length;
  elements.activeFilterCount.textContent = `${active} active`;
  elements.filterSummary.textContent = active ? [filters.page.value && "page URL", filters.query.value && "search query"].filter(Boolean).join(" + ") : "Optional URL and search-query filters";
  renderQuickFilters();
}

function renderQuickFilters() {
  const filters = getFilters();
  Object.entries(FILTER_PRESETS).forEach(([target, presets]) => {
    const container = elements[`${target}QuickFilters`];
    const current = filters[target];
    container.innerHTML = presets.map((preset) => `
      <button class="quick-filter${current.mode === preset.mode && current.value === preset.value ? " active" : ""}" type="button" data-filter-target="${target}" data-filter-preset="${preset.id}">${preset.label}</button>`).join("")
      + (current.value ? `<button class="quick-filter clear" type="button" data-filter-target="${target}" data-filter-clear>Clear</button>` : "");
  });
}

function applyQuickFilter(target, presetId) {
  const preset = FILTER_PRESETS[target].find((item) => item.id === presetId);
  if (!preset) return;
  elements[`${target}FilterMode`].value = preset.mode;
  elements[`${target}Filter`].value = preset.value;
  handleFilterChange();
}

function clearFilter(target) {
  elements[`${target}Filter`].value = "";
  handleFilterChange();
}

function handleFilterChange() {
  saveConfig();
  state.rows = [];
  elements.downloadFullButton.disabled = true;
  renderFilterSummary();
  if (state.selected) renderSelectedQuery(false);
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

function renderPageScopes() {
  const current = PAGE_SCOPES.find((scope) => scope.id === state.pageScope) || PAGE_SCOPES[0];
  const hasCustomPattern = elements.customScopeRegex.value.trim();
  elements.pageScopeSummary.textContent = current.custom && !hasCustomPattern ? "Enter a regex to define this page group" : current.summary;
  elements.customScopeEditor.hidden = !current.custom;
  elements.pageScopeTabs.innerHTML = PAGE_SCOPES.map((scope) => `
    <button class="page-scope-tab${scope.id === state.pageScope ? " active" : ""}" data-page-scope="${scope.id}" role="tab" aria-selected="${scope.id === state.pageScope}">
      <span>${scope.label}</span><i>${scope.custom ? "Editable pattern" : scope.pattern ? "URL regex on" : "No URL filter"}</i>
    </button>`).join("");
}

async function prepareWordGroups() {}

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
  state.rows = [];
  elements.downloadFullButton.disabled = true;
  renderQueries();
  renderSelectedQuery();
}

function renderSelectedQuery(scroll = true) {
  elements.resultTitle.textContent = state.selected.title;
  const scope = PAGE_SCOPES.find((item) => item.id === state.pageScope) || PAGE_SCOPES[0];
  elements.resultStatus.textContent = `${state.selected.category} · ${scope.label}`;
  let sql = "";
  try { sql = getPortableSql(state.selected); } catch (error) { sql = `-- ${error.message}\n-- Correct the filter before estimating or running this query.`; }
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
    await prepareWordGroups();
    elements.dryRunButton.disabled = true; elements.resultStatus.textContent = "Estimating bytes…";
    const payload = await authorizedFetch(`https://bigquery.googleapis.com/bigquery/v2/projects/${encodeURIComponent(config.projectId)}/jobs`, {
      method: "POST",
      body: JSON.stringify({ jobReference: { projectId: config.projectId, location: config.location }, configuration: { dryRun: true, query: { query: hydrateSql(state.selected), useLegacySql: false, ...getQueryParameters() } } }),
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
    await prepareWordGroups();
    elements.runQueryButton.disabled = true; elements.dryRunButton.disabled = true;
    elements.downloadFullButton.disabled = true; state.rows = [];
    elements.resultStatus.textContent = "Running in BigQuery…";
    elements.resultMeta.hidden = true; elements.tableShell.hidden = true; elements.emptyState.hidden = false;
    elements.emptyState.innerHTML = '<div class="empty-glyph">RUN<br />•••</div><p>BigQuery is processing the selected shortcut.</p>';
    let payload = await authorizedFetch(`https://bigquery.googleapis.com/bigquery/v2/projects/${encodeURIComponent(config.projectId)}/queries`, {
      method: "POST",
      body: JSON.stringify({ query: hydrateSql(state.selected), useLegacySql: false, ...getQueryParameters(), location: config.location, maxResults: QUERY_PAGE_SIZE, timeoutMs: 20000 }),
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
  state.rows = rows.map((row) => Object.fromEntries(fields.map((field, index) => [field.name, normalizeCell(row.f?.[index]?.v)])));
  const visibleRows = state.rows.slice(0, RENDER_ROW_LIMIT);
  elements.resultStatus.textContent = "Query complete";
  elements.resultMeta.hidden = false;
  elements.resultMeta.innerHTML = `<span>${state.rows.length.toLocaleString()} rows downloaded</span><span>${visibleRows.length.toLocaleString()} displayed</span><span>${formatBytes(Number(payload.totalBytesProcessed || 0))} processed</span><span>${payload.cacheHit ? "cache hit" : "live execution"}</span>`;
  elements.downloadFullButton.disabled = !state.rows.length;
  elements.emptyState.hidden = true; elements.tableShell.hidden = false;
  if (!fields.length) {
    elements.tableShell.hidden = true; elements.emptyState.hidden = false;
    elements.emptyState.innerHTML = '<div class="empty-glyph">DONE<br />0</div><p>The query completed but returned no rows.</p>';
    return;
  }
  elements.resultsTable.innerHTML = `<thead><tr>${fields.map((field) => `<th>${escapeHtml(field.name)}</th>`).join("")}</tr></thead><tbody>${visibleRows.map((row) => `<tr>${fields.map((field) => `<td>${escapeHtml(formatCell(row[field.name]))}</td>`).join("")}</tr>`).join("")}</tbody>`;
  if (state.rows.length > AUTO_DOWNLOAD_ROW_LIMIT) {
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
  const csv = [headers, ...state.rows.map((row) => headers.map((header) => row[header]))]
    .map((row) => row.map((value) => `"${String(formatCell(value)).replaceAll('"', '""')}"`).join(",")).join("\n");
  const scope = state.pageScope;
  const anchor = document.createElement("a"); anchor.href = URL.createObjectURL(new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" }));
  anchor.download = `${state.selected.id}-${state.selected.title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${scope}.csv`; anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(anchor.href), 1000);
  showToast(automatic ? `The ${state.rows.length.toLocaleString()}-row result was too large to render fully, so its CSV download started automatically.` : `Downloading all ${state.rows.length.toLocaleString()} rows.`);
}

elements.connectButton.addEventListener("click", connectGoogle);
elements.disconnectButton.addEventListener("click", disconnectGoogle);
elements.configForm.addEventListener("change", () => {
  saveConfig();
  state.rows = [];
  elements.downloadFullButton.disabled = true;
  if (state.selected) renderSelectedQuery(false);
});
elements.categoryTabs.addEventListener("click", (event) => { const button = event.target.closest("[data-category]"); if (!button) return; state.category = button.dataset.category; renderCategories(); renderQueries(); });
elements.pageScopeTabs.addEventListener("click", (event) => {
  const button = event.target.closest("[data-page-scope]");
  if (!button) return;
  state.pageScope = button.dataset.pageScope;
  saveConfig();
  state.rows = [];
  elements.downloadFullButton.disabled = true;
  renderPageScopes();
  if (state.selected) renderSelectedQuery(false);
  const scope = PAGE_SCOPES.find((item) => item.id === state.pageScope) || PAGE_SCOPES[0];
  showToast(`${scope.label} filter selected.`);
});
elements.queryGrid.addEventListener("click", (event) => { const card = event.target.closest("[data-id]"); if (card) selectQuery(card.dataset.id); });
elements.querySearch.addEventListener("input", renderQueries);
[elements.pageFilter, elements.pageFilterMode, elements.queryFilter, elements.queryFilterMode].forEach((element) => element.addEventListener("input", handleFilterChange));
elements.customScopeRegex.addEventListener("input", () => {
  saveConfig();
  state.rows = [];
  elements.downloadFullButton.disabled = true;
  renderPageScopes();
  if (state.selected) renderSelectedQuery(false);
});
[elements.pageQuickFilters, elements.queryQuickFilters].forEach((container) => container.addEventListener("click", (event) => {
  const button = event.target.closest("[data-filter-target]");
  if (!button) return;
  if (button.hasAttribute("data-filter-clear")) clearFilter(button.dataset.filterTarget);
  else applyQuickFilter(button.dataset.filterTarget, button.dataset.filterPreset);
}));
elements.copySqlButton.addEventListener("click", async () => { try { await navigator.clipboard.writeText(getPortableSql(state.selected)); renderSelectedQuery(false); showToast("SQL copied."); } catch (error) { showToast(error.message, true); } });
elements.dryRunButton.addEventListener("click", dryRun);
elements.runQueryButton.addEventListener("click", runQuery);
elements.downloadFullButton.addEventListener("click", () => downloadCsv(false));

loadConfig(); renderPageScopes(); renderFilterSummary(); renderCategories(); renderQueries(); setConnected(false);
