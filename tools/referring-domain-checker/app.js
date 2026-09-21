const STORAGE_KEY = 'link-ledger-domains-v1';
const $ = selector => document.querySelector(selector);
let inventory = loadInventory();
let lastResults = [];

function loadInventory() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); } catch { return []; }
}
function saveInventory() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(inventory));
  $('#inventoryCount').textContent = inventory.length.toLocaleString();
}
function showToast(message) {
  const toast = $('#toast'); toast.textContent = message; toast.classList.add('show');
  clearTimeout(showToast.timer); showToast.timer = setTimeout(() => toast.classList.remove('show'), 2600);
}
function showStep(number) {
  document.querySelectorAll('.step').forEach(node => node.classList.toggle('active', node.dataset.step === String(number)));
  document.querySelectorAll('.panel').forEach(node => node.classList.toggle('active', node.id === `step${number}`));
}
async function importFiles(files) {
  if (!files.length) return;
  let added = 0;
  for (const file of files) {
    const domains = DomainUtils.parseDomainText(await file.text());
    const before = inventory.length;
    inventory = [...new Set([...inventory, ...domains])].sort();
    added += inventory.length - before;
  }
  saveInventory();
  const summary = $('#importSummary'); summary.hidden = false;
  summary.innerHTML = `<strong>${added.toLocaleString()} new domains remembered.</strong> Your inventory now contains ${inventory.length.toLocaleString()} unique domains.`;
  showToast(`Imported ${added.toLocaleString()} new domains`);
}
function runCheck() {
  const candidates = DomainUtils.parseDomainText($('#candidateText').value);
  if (!candidates.length) { showToast('Add at least one valid domain'); return; }
  lastResults = DomainUtils.compareDomains(candidates, inventory);
  const found = lastResults.filter(item => item.exists).length;
  const missing = lastResults.length - found;
  $('#results').classList.remove('empty');
  $('#results').innerHTML = `<div class="receipt-head"><span>LINK LEDGER / CHECK</span><span>${new Date().toISOString().slice(0,10)}</span></div>
    <div class="result-summary"><div><strong>${found}</strong><span>already have</span></div><div><strong>${missing}</strong><span>new opportunities</span></div></div>
    <div class="result-list">${lastResults.map(item => `<div class="result-row"><span>${item.exists ? '●' : '○'}</span><span>${escapeHtml(item.domain)}</span><span class="stamp ${item.exists ? 'found' : 'new'}">${item.exists ? 'FOUND' : 'NEW'}</span></div>`).join('')}</div>
    <div class="result-actions"><button data-copy="new">Copy new</button><button data-download>Download CSV</button></div>`;
}
function escapeHtml(value) { const el = document.createElement('div'); el.textContent = value; return el.innerHTML; }
function downloadResults() {
  const csv = ['domain,status', ...lastResults.map(item => `${item.domain},${item.exists ? 'already-have' : 'new'}`)].join('\n');
  const link = document.createElement('a'); link.href = URL.createObjectURL(new Blob([csv], { type:'text/csv' })); link.download = 'link-ledger-results.csv'; link.click(); URL.revokeObjectURL(link.href);
}

document.querySelectorAll('[data-step]').forEach(button => button.addEventListener('click', () => showStep(button.dataset.step)));
document.querySelectorAll('[data-next]').forEach(button => button.addEventListener('click', () => showStep(button.dataset.next)));
$('#backToImport').addEventListener('click', () => showStep(1));
$('#importFile').addEventListener('change', event => importFiles([...event.target.files]));
$('#candidateFile').addEventListener('change', async event => { const file = event.target.files[0]; if (file) $('#candidateText').value = await file.text(); });
$('#checkButton').addEventListener('click', runCheck);
$('#clearInventory').addEventListener('click', () => { if (inventory.length && confirm('Clear every remembered referring domain?')) { inventory=[]; saveInventory(); $('#importSummary').hidden=true; showToast('Inventory cleared'); } });
const dropzone = $('#importDropzone');
['dragenter','dragover'].forEach(type => dropzone.addEventListener(type, event => { event.preventDefault(); dropzone.classList.add('drag'); }));
['dragleave','drop'].forEach(type => dropzone.addEventListener(type, event => { event.preventDefault(); dropzone.classList.remove('drag'); }));
dropzone.addEventListener('drop', event => importFiles([...event.dataTransfer.files]));
$('#results').addEventListener('click', async event => {
  if (event.target.matches('[data-copy]')) { await navigator.clipboard.writeText(lastResults.filter(item => !item.exists).map(item => item.domain).join('\n')); showToast('New domains copied'); }
  if (event.target.matches('[data-download]')) downloadResults();
});
$('#receiptDate').textContent = new Date().toISOString().slice(0,10);
saveInventory();
