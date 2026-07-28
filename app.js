const RDAP_BASE = "https://rdap.org/domain/";
const DOMAIN_HEADERS = ["domain", "domain name", "domain_name", "url", "website"];
const RESULT_HEADERS = ["Normalized Domain", "Expired", "Expiration Date (UTC)", "Days Until Expiry", "Registration Status", "RDAP Checked At (UTC)", "RDAP Source", "Check Error"];

const state = { file: null, workbook: null, results: new Map(), cancelled: false };
const $ = (id) => document.getElementById(id);
const elements = {
  dropZone: $("drop-zone"), fileInput: $("file-input"), setup: $("setup-panel"),
  progress: $("progress-panel"), results: $("results-panel"), error: $("error-box"),
  sheet: $("sheet-select"), column: $("column-select"), warning: $("warning-days")
};

function normalizeDomain(value) {
  let text = String(value ?? "").trim().toLowerCase();
  if (!text) return "";
  try {
    const url = new URL(text.includes("://") ? text : `https://${text}`);
    let host = url.hostname.replace(/\.$/, "").replace(/^www\./, "");
    if (!host.includes(".") || host.length > 253 || !/^[a-z0-9.-]+$/i.test(host)) return "";
    if (host.split(".").some(label => !label || label.length > 63 || label.startsWith("-") || label.endsWith("-"))) return "";
    return host;
  } catch { return ""; }
}

function expirationFromRdap(payload) {
  const dates = (payload.events || [])
    .filter(event => ["expiration", "expiry", "expires"].includes(String(event.eventAction || "").toLowerCase()))
    .map(event => new Date(event.eventDate))
    .filter(date => !Number.isNaN(date.getTime()));
  return dates.length ? new Date(Math.max(...dates)) : null;
}

function classify(payload, domain, warningDays) {
  const checkedAt = new Date();
  const source = `${RDAP_BASE}${encodeURIComponent(domain)}`;
  const expiry = expirationFromRdap(payload);
  if (!expiry) return { domain, expired: "UNKNOWN", expiration: "", days: null, status: "REGISTERED_NO_EXPIRY_DATE", checkedAt: checkedAt.toISOString(), source, error: "RDAP returned no expiration event" };
  const days = Math.ceil((expiry - checkedAt) / 86400000);
  const statuses = (payload.status || []).map(value => String(value).toLowerCase());
  let status = days < 0 ? "PAST_EXPIRY_DATE" : days <= warningDays ? "EXPIRING_SOON" : "ACTIVE";
  if (statuses.some(value => value.includes("redemption"))) status = "REDEMPTION_PERIOD";
  return { domain, expired: days < 0 ? "YES" : "NO", expiration: expiry.toISOString(), days, status, checkedAt: checkedAt.toISOString(), source, error: "" };
}

async function fetchDomain(domain, warningDays, signal, retries = 2) {
  const source = `${RDAP_BASE}${encodeURIComponent(domain)}`;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await fetch(source, { headers: { Accept: "application/rdap+json, application/json" }, signal });
      if (response.status === 404) return { domain, expired: "UNKNOWN", expiration: "", days: null, status: "NOT_REGISTERED", checkedAt: new Date().toISOString(), source, error: "RDAP returned 404; not present in the registry" };
      if (!response.ok) {
        if ((response.status === 429 || response.status >= 500) && attempt < retries) { await delay(700 * (2 ** attempt), signal); continue; }
        throw new Error(`RDAP returned HTTP ${response.status}`);
      }
      return classify(await response.json(), domain, warningDays);
    } catch (error) {
      if (error.name === "AbortError") throw error;
      if (attempt < retries) { await delay(700 * (2 ** attempt), signal); continue; }
      return { domain, expired: "UNKNOWN", expiration: "", days: null, status: "UNKNOWN", checkedAt: new Date().toISOString(), source, error: error.message || "Request failed" };
    }
  }
}

function delay(ms, signal) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener("abort", () => { clearTimeout(timer); reject(new DOMException("Cancelled", "AbortError")); }, { once: true });
  });
}

async function loadFile(file) {
  clearError();
  if (!/\.(xlsx|xls|csv)$/i.test(file.name)) return showError("Choose an XLSX, XLS, or CSV file.");
  try {
    const buffer = await file.arrayBuffer();
    state.file = file;
    state.workbook = XLSX.read(buffer, { type: "array", cellDates: true });
    $("file-name").textContent = file.name;
    $("file-meta").textContent = `${formatBytes(file.size)} · ${state.workbook.SheetNames.length} worksheet${state.workbook.SheetNames.length === 1 ? "" : "s"}`;
    elements.sheet.replaceChildren(...state.workbook.SheetNames.map(name => new Option(name, name)));
    refreshColumns();
    elements.dropZone.hidden = true;
    elements.setup.hidden = false;
  } catch (error) { showError(`The spreadsheet could not be read: ${error.message}`); }
}

function refreshColumns() {
  const sheet = state.workbook.Sheets[elements.sheet.value];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, range: 0, blankrows: false });
  const headers = (rows[0] || []).map((value, index) => ({ label: String(value || `Column ${XLSX.utils.encode_col(index)}`).trim(), index }));
  elements.column.replaceChildren(...headers.map(item => new Option(item.label, item.index)));
  const detected = headers.find(item => DOMAIN_HEADERS.includes(item.label.toLowerCase()));
  if (detected) elements.column.value = String(detected.index);
}

async function checkDomains() {
  clearError();
  const sheet = state.workbook.Sheets[elements.sheet.value];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "", blankrows: true });
  const columnIndex = Number(elements.column.value);
  const domains = [...new Set(rows.slice(1).map(row => normalizeDomain(row[columnIndex])).filter(Boolean))];
  if (!domains.length) return showError("No valid domains were found in the selected column.");

  state.cancelled = false;
  state.results.clear();
  state.controller = new AbortController();
  elements.setup.hidden = true;
  elements.progress.hidden = false;
  $("progress-count").textContent = `0 / ${domains.length}`;
  $("progress-bar").style.width = "0%";
  const warningDays = Number(elements.warning.value);
  let completed = 0;

  try {
    for (let start = 0; start < domains.length; start += 4) {
      if (state.cancelled) throw new DOMException("Cancelled", "AbortError");
      const batch = domains.slice(start, start + 4);
      $("current-domain").textContent = `Checking ${batch.join(", ")}`;
      const batchResults = await Promise.all(batch.map(domain => fetchDomain(domain, warningDays, state.controller.signal)));
      batchResults.forEach(result => state.results.set(result.domain, result));
      completed += batch.length;
      $("progress-count").textContent = `${completed} / ${domains.length}`;
      $("progress-bar").style.width = `${(completed / domains.length) * 100}%`;
      if (start + 4 < domains.length) await delay(150, state.controller.signal);
    }
    populateResultMetrics();
    elements.progress.hidden = true;
    elements.results.hidden = false;
  } catch (error) {
    elements.progress.hidden = true;
    elements.setup.hidden = false;
    if (error.name !== "AbortError") showError(`The check stopped: ${error.message}`);
  }
}

function populateResultMetrics() {
  const values = [...state.results.values()];
  $("metric-checked").textContent = values.length;
  $("metric-active").textContent = values.filter(value => value.status === "ACTIVE").length;
  $("metric-attention").textContent = values.filter(value => ["EXPIRING_SOON", "PAST_EXPIRY_DATE", "REDEMPTION_PERIOD"].includes(value.status)).length;
  $("metric-unknown").textContent = values.filter(value => ["UNKNOWN", "NOT_REGISTERED", "REGISTERED_NO_EXPIRY_DATE"].includes(value.status)).length;
}

function downloadWorkbook() {
  const workbook = state.workbook;
  const sheet = workbook.Sheets[elements.sheet.value];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "", blankrows: true });
  const columnIndex = Number(elements.column.value);
  const existingHeaders = new Set((rows[0] || []).map(String));
  const headers = RESULT_HEADERS.map(original => {
    let candidate = original, suffix = 2;
    while (existingHeaders.has(candidate)) candidate = `${original} (${suffix++})`;
    existingHeaders.add(candidate); return candidate;
  });
  rows[0] = [...(rows[0] || []), ...headers];
  for (let index = 1; index < rows.length; index++) {
    const domain = normalizeDomain(rows[index][columnIndex]);
    const result = state.results.get(domain);
    rows[index].push(...(result ? [result.domain, result.expired, result.expiration, result.days, result.status, result.checkedAt, result.source, result.error] : [domain, "UNKNOWN", "", null, domain ? "NOT_CHECKED" : "INVALID_OR_EMPTY", "", "", ""]));
  }
  workbook.Sheets[elements.sheet.value] = XLSX.utils.aoa_to_sheet(rows);
  const outputName = state.file.name.replace(/\.(xlsx|xls|csv)$/i, "") + "-checked.xlsx";
  XLSX.writeFile(workbook, outputName, { compression: true });
}

function reset() {
  if (state.controller) state.controller.abort();
  state.file = null; state.workbook = null; state.results.clear();
  elements.fileInput.value = "";
  elements.setup.hidden = true; elements.progress.hidden = true; elements.results.hidden = true;
  elements.dropZone.hidden = false; clearError();
}
function showError(message) { elements.error.textContent = message; elements.error.hidden = false; }
function clearError() { elements.error.hidden = true; elements.error.textContent = ""; }
function formatBytes(bytes) { return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`; }

elements.dropZone.addEventListener("click", () => elements.fileInput.click());
elements.dropZone.addEventListener("keydown", event => { if (["Enter", " "].includes(event.key)) { event.preventDefault(); elements.fileInput.click(); } });
elements.fileInput.addEventListener("change", event => event.target.files[0] && loadFile(event.target.files[0]));
["dragenter", "dragover"].forEach(name => elements.dropZone.addEventListener(name, event => { event.preventDefault(); elements.dropZone.classList.add("dragging"); }));
["dragleave", "drop"].forEach(name => elements.dropZone.addEventListener(name, event => { event.preventDefault(); elements.dropZone.classList.remove("dragging"); }));
elements.dropZone.addEventListener("drop", event => event.dataTransfer.files[0] && loadFile(event.dataTransfer.files[0]));
elements.sheet.addEventListener("change", refreshColumns);
$("remove-file").addEventListener("click", reset);
$("check-button").addEventListener("click", checkDomains);
$("cancel-button").addEventListener("click", () => { state.cancelled = true; state.controller.abort(); });
$("download-button").addEventListener("click", downloadWorkbook);
$("start-over").addEventListener("click", reset);

if (typeof module !== "undefined") module.exports = { normalizeDomain, expirationFromRdap, classify };
